"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { SceneLayout } from "@/lib/gameScene";
import styles from "./scenePreview.module.css";

type Axis = "x" | "y" | "z";
type View = "perspective" | "top" | "front";
type Runtime = {
  update: (layout: SceneLayout) => void;
  select: (key: string) => void;
  frame: (view: View) => void;
  configure: (enabled: boolean, snap: number) => void;
  cancel: () => void;
};
type Drag = {
  pointer: number;
  key: string;
  axis: Axis;
  base: SceneLayout;
  next: SceneLayout;
  plane: THREE.Plane;
  hit: THREE.Vector3;
  origin: THREE.Vector3;
  object: THREE.Object3D;
  objectStart: THREE.Vector3;
};

function drawable(layout: SceneLayout): boolean {
  return [layout.spawn, layout.exit, ...layout.collectibles].every((point) =>
    [point.x, point.y, point.z].every(Number.isFinite),
  ) && layout.platforms.every((item) =>
    [item.x, item.z, item.w, item.d, item.top].every(Number.isFinite)
    && item.w > 0 && item.d > 0,
  );
}

function originFor(layout: SceneLayout, key: string): THREE.Vector3 | null {
  if (key === "spawn" || key === "exit") {
    const point = layout[key];
    return new THREE.Vector3(point.x, point.y, point.z);
  }
  const platform = layout.platforms.find((item) => `platform:${item.id}` === key);
  if (platform) return new THREE.Vector3(platform.x, platform.top, platform.z);
  const gem = layout.collectibles.find((item) => `gem:${item.id}` === key);
  return gem ? new THREE.Vector3(gem.x, gem.y, gem.z) : null;
}

function translated(
  base: SceneLayout, key: string, axis: Axis, value: number, snap: number,
): SceneLayout {
  const platform = base.platforms.find((item) => `platform:${item.id}` === key);
  const gem = base.collectibles.find((item) => `gem:${item.id}` === key);
  let min = -50;
  let max = 50;
  if (axis === "y") {
    min = gem ? 0.3 : 0;
    max = platform ? 20 : 25;
  } else if (platform) {
    const half = (axis === "x" ? platform.w : platform.d) / 2;
    min += half;
    max -= half;
  }
  const snapped = snap > 0 ? Math.round(value / snap) * snap : value;
  const next = Number(Math.max(min, Math.min(max, snapped)).toFixed(3));
  if (platform) {
    const field = axis === "y" ? "top" : axis;
    return {
      ...base,
      platforms: base.platforms.map((item) =>
        item.id === platform.id ? { ...item, [field]: next } : item),
    };
  }
  if (gem) {
    return {
      ...base,
      collectibles: base.collectibles.map((item) =>
        item.id === gem.id ? { ...item, [axis]: next } : item),
    };
  }
  if (key === "spawn" || key === "exit") {
    return { ...base, [key]: { ...base[key], [axis]: next } };
  }
  return base;
}

function disposeObjects(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      geometries.add(object.geometry);
      const list = Array.isArray(object.material) ? object.material : [object.material];
      list.forEach((material) => materials.add(material));
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

export default function ScenePreview({
  layout, selected, onSelect, disabled, onCommit,
}: {
  layout: SceneLayout;
  selected: string;
  onSelect: (key: string) => void;
  disabled: boolean;
  onCommit: (next: SceneLayout, source: SceneLayout) => boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const interaction = useRef({ disabled, onSelect, onCommit });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [moveEnabled, setMoveEnabled] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [step, setStep] = useState(0.5);
  const [moving, setMoving] = useState(false);
  const valid = drawable(layout);

  useEffect(() => {
    interaction.current = { disabled, onSelect, onCommit };
  }, [disabled, onSelect, onCommit]);

  useEffect(() => {
    const surface = canvas.current;
    if (!surface) return;
    setError("");
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: surface, antialias: true, powerPreference: "low-power",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    } catch {
      setError("The 3D preview could not start. Your draft remains available in the map and numeric fields.");
      return;
    }

    let stopped = false;
    let framed = false;
    let selection = "";
    let current: SceneLayout | null = null;
    let enabled = false;
    let snap = 0.5;
    let drag: Drag | null = null;
    let press: { id: number; x: number; y: number } | null = null;
    let outline: THREE.BoxHelper | null = null;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#142638");
    const group = new THREE.Group();
    const handles = new THREE.Group();
    handles.visible = false;
    scene.add(group, handles);
    scene.add(new THREE.HemisphereLight("#e4f4ff", "#354b42", 2));
    const light = new THREE.DirectionalLight("#fff2db", 2);
    light.position.set(-15, 30, 20);
    scene.add(light);
    const grid = new THREE.GridHelper(100, 100, "#8c9cb5", "#34485b");
    grid.position.y = -0.65;
    scene.add(grid);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    const controls = new OrbitControls(camera, surface);
    controls.enableDamping = false;
    controls.minDistance = 2;
    controls.maxDistance = 400;
    const raycaster = new THREE.Raycaster();

    for (const axis of ["x", "y", "z"] as const) {
      const material = new THREE.MeshBasicMaterial({
        color: axis === "x" ? "#ff6464" : axis === "y" ? "#67ec91" : "#6da7ff",
        depthTest: false,
      });
      const size = new THREE.Vector3(0.055, 0.055, 0.055);
      size[axis] = 1.1;
      const stem = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
      stem.position[axis] = 0.55;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), material);
      head.position[axis] = 1.2;
      for (const mesh of [stem, head]) {
        mesh.userData.axis = axis;
        mesh.renderOrder = 100;
        handles.add(mesh);
      }
    }

    function syncHandles() {
      const source = drag?.next ?? current;
      const point = source ? originFor(source, selection) : null;
      handles.visible = enabled && !!point && !interaction.current.disabled;
      if (point) {
        handles.position.copy(point);
        handles.scale.setScalar(Math.max(1.2, Math.min(8, camera.position.distanceTo(point) * 0.11)));
      }
      handles.updateMatrixWorld(true);
    }

    function draw() {
      if (stopped) return;
      syncHandles();
      try {
        renderer.render(scene, camera);
      } catch {
        cancel();
        stopped = true;
        controls.enabled = false;
        setError("The preview stopped rendering. Export your draft before reloading.");
      }
    }

    function release(pointer: number) {
      if (surface!.hasPointerCapture(pointer)) surface!.releasePointerCapture(pointer);
    }

    function cancel() {
      const previous = drag;
      drag = null;
      press = null;
      if (!previous) return;
      previous.object.position.copy(previous.objectStart);
      previous.object.updateMatrixWorld(true);
      outline?.update();
      controls.enabled = !stopped;
      setMoving(false);
      setMessage("Movement cancelled. Original position restored.");
      release(previous.pointer);
    }

    function clearOutline() {
      if (!outline) return;
      scene.remove(outline);
      disposeObjects(outline);
      outline = null;
    }

    function highlight(key: string) {
      selection = key;
      clearOutline();
      const object = group.children.find((item) => item.userData.selectionKey === key);
      if (object) {
        group.updateMatrixWorld(true);
        outline = new THREE.BoxHelper(object, "#ffffff");
        outline.material.depthTest = false;
        outline.renderOrder = 10;
        scene.add(outline);
      }
    }

    function select(key: string) {
      cancel();
      highlight(key);
      draw();
    }

    function frame(view: View) {
      if (stopped || drag) return;
      const bounds = new THREE.Box3().setFromObject(group);
      const sphere = bounds.isEmpty()
        ? new THREE.Sphere(new THREE.Vector3(), 12)
        : bounds.getBoundingSphere(new THREE.Sphere());
      const vertical = THREE.MathUtils.degToRad(camera.fov);
      const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
      const distance = Math.max(8, sphere.radius / Math.sin(Math.min(vertical, horizontal) / 2) * 1.15);
      const direction = view === "top" ? new THREE.Vector3(0, 1, 0.001)
        : view === "front" ? new THREE.Vector3(0, 0.15, 1)
        : new THREE.Vector3(1, 0.9, 1.2);
      controls.target.copy(sphere.center);
      camera.position.copy(sphere.center).addScaledVector(direction.normalize(), distance);
      controls.update();
      draw();
    }

    function box(w: number, h: number, d: number, color: string) {
      return new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
      );
    }

    function update(next: SceneLayout) {
      cancel();
      current = next;
      clearOutline();
      disposeObjects(group);
      group.clear();
      if (!drawable(next)) {
        handles.visible = false;
        enabled = false;
        draw();
        return;
      }
      next.platforms.forEach((item) => {
        const mesh = box(item.w, 0.6, item.d, "#609679");
        mesh.position.set(item.x, item.top - 0.3, item.z);
        mesh.userData.selectionKey = `platform:${item.id}`;
        group.add(mesh);
      });
      const player = box(0.6, 1.1, 0.6, "#5be0cc");
      player.position.set(next.spawn.x, next.spawn.y + 0.55, next.spawn.z);
      player.userData.selectionKey = "spawn";
      group.add(player);
      next.collectibles.forEach((item) => {
        const gem = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.3),
          new THREE.MeshStandardMaterial({ color: "#ffd675" }),
        );
        gem.position.set(item.x, item.y, item.z);
        gem.userData.selectionKey = `gem:${item.id}`;
        group.add(gem);
      });
      const gate = new THREE.Group();
      for (const x of [-0.75, 0.75]) {
        const post = box(0.18, 2.2, 0.2, "#b89ee7");
        post.position.set(x, 1.1, 0);
        gate.add(post);
      }
      const beam = box(1.7, 0.2, 0.2, "#b89ee7");
      beam.position.y = 2.2;
      gate.add(beam);
      gate.position.set(next.exit.x, next.exit.y, next.exit.z);
      gate.userData.selectionKey = "exit";
      group.add(gate);
      highlight(selection);
      if (!framed) {
        framed = true;
        frame("perspective");
      } else draw();
    }

    function ray(event: PointerEvent) {
      const bounds = surface!.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return false;
      camera.updateMatrixWorld(true);
      group.updateMatrixWorld(true);
      syncHandles();
      raycaster.setFromCamera(new THREE.Vector2(
        (event.clientX - bounds.left) / bounds.width * 2 - 1,
        -(event.clientY - bounds.top) / bounds.height * 2 + 1,
      ), camera);
      return true;
    }

    function down(event: PointerEvent) {
      if (drag) {
        if (!event.isPrimary) { cancel(); draw(); }
        return;
      }
      if (stopped || interaction.current.disabled || !event.isPrimary || event.button !== 0) {
        press = null;
        return;
      }
      if (!ray(event)) return;
      const axis = handles.visible
        ? raycaster.intersectObjects(handles.children, false)[0]?.object.userData.axis as Axis | undefined
        : undefined;
      const object = group.children.find((item) => item.userData.selectionKey === selection);
      const origin = current ? originFor(current, selection) : null;
      if (axis && current && object && origin) {
        const direction = new THREE.Vector3();
        direction[axis] = 1;
        const normal = camera.getWorldDirection(new THREE.Vector3());
        normal.addScaledVector(direction, -normal.dot(direction));
        if (normal.lengthSq() < 0.001) {
          setMessage("Orbit the camera slightly to move along this axis.");
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        const hit = raycaster.intersectObjects(handles.children, false)[0].point;
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal.normalize(), hit);
        drag = {
          pointer: event.pointerId, key: selection, axis,
          base: current, next: current, plane, hit: hit.clone(),
          origin, object, objectStart: object.position.clone(),
        };
        press = null;
        controls.enabled = false;
        surface!.focus();
        surface!.setPointerCapture(event.pointerId);
        setMoving(true);
        setMessage(`Moving ${axis.toUpperCase()}. Release to apply, Escape to cancel.`);
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      press = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }

    function move(event: PointerEvent) {
      if (drag && drag.pointer === event.pointerId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!ray(event)) return;
        const point = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
        if (!point) return;
        const value = drag.origin[drag.axis] + point[drag.axis] - drag.hit[drag.axis];
        drag.next = translated(drag.base, drag.key, drag.axis, value, snap);
        const nextOrigin = originFor(drag.next, drag.key);
        if (!nextOrigin) return;
        drag.object.position.copy(drag.objectStart).add(
          nextOrigin.clone().sub(drag.origin),
        );
        drag.object.updateMatrixWorld(true);
        outline?.update();
        draw();
      } else if (press && press.id === event.pointerId &&
          Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) {
        press = null;
      }
    }

    function up(event: PointerEvent) {
      if (drag && drag.pointer === event.pointerId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const completed = drag;
        drag = null;
        controls.enabled = true;
        setMoving(false);
        release(event.pointerId);
        const changed = JSON.stringify(completed.next) !== JSON.stringify(completed.base);
        const accepted = changed && !interaction.current.disabled &&
          interaction.current.onCommit(completed.next, completed.base);
        update(accepted ? completed.next : current!);
        setMessage(accepted
          ? "Movement applied as one draft edit. Save scene to persist it."
          : "No movement applied.");
        return;
      }
      const start = press;
      press = null;
      if (!start || start.id !== event.pointerId || stopped || interaction.current.disabled ||
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
      const bounds = surface!.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom || !ray(event)) return;
      let object: THREE.Object3D | null =
        raycaster.intersectObjects(group.children, true)[0]?.object ?? null;
      while (object && object !== group && typeof object.userData.selectionKey !== "string") {
        object = object.parent;
      }
      interaction.current.onSelect(
        typeof object?.userData.selectionKey === "string" ? object.userData.selectionKey : "",
      );
    }

    function cancelled() { cancel(); draw(); }
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape" && drag) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        draw();
      }
    }
    function hidden() { if (document.hidden) cancelled(); }
    function resize() {
      if (stopped) return;
      const width = Math.max(1, Math.round(surface!.getBoundingClientRect().width));
      const height = Math.max(1, Math.round(width * 9 / 16));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      draw();
    }
    function lost(event: Event) {
      event.preventDefault();
      cancel();
      stopped = true;
      controls.enabled = false;
      setError("The browser lost the graphics context. Export your draft before reloading.");
    }

    surface.addEventListener("pointerdown", down, true);
    surface.addEventListener("pointermove", move, true);
    surface.addEventListener("pointerup", up, true);
    surface.addEventListener("pointercancel", cancelled);
    surface.addEventListener("lostpointercapture", cancelled);
    surface.addEventListener("blur", cancelled);
    surface.addEventListener("keydown", keydown);
    surface.addEventListener("webglcontextlost", lost);
    window.addEventListener("blur", cancelled);
    document.addEventListener("visibilitychange", hidden);
    controls.addEventListener("change", draw);
    const observer = new ResizeObserver(resize);
    observer.observe(surface);
    runtime.current = {
      update, select, frame,
      configure: (nextEnabled, nextSnap) => {
        cancel();
        enabled = nextEnabled;
        snap = nextSnap;
        draw();
      },
      cancel: cancelled,
    };
    resize();

    return () => {
      stopped = true;
      drag = null;
      runtime.current = null;
      observer.disconnect();
      surface.removeEventListener("pointerdown", down, true);
      surface.removeEventListener("pointermove", move, true);
      surface.removeEventListener("pointerup", up, true);
      surface.removeEventListener("pointercancel", cancelled);
      surface.removeEventListener("lostpointercapture", cancelled);
      surface.removeEventListener("blur", cancelled);
      surface.removeEventListener("keydown", keydown);
      surface.removeEventListener("webglcontextlost", lost);
      window.removeEventListener("blur", cancelled);
      document.removeEventListener("visibilitychange", hidden);
      controls.removeEventListener("change", draw);
      controls.dispose();
      disposeObjects(scene);
      renderer.dispose();
    };
  }, []);

  useEffect(() => { runtime.current?.update(layout); }, [layout]);
  useEffect(() => { runtime.current?.select(selected); }, [selected]);
  useEffect(() => {
    runtime.current?.configure(moveEnabled && !disabled && valid, snapEnabled ? step : 0);
  }, [moveEnabled, disabled, valid, snapEnabled, step]);

  return <section className={styles.panel} aria-label="3D draft preview">
    <h2>Inspect and position your draft in 3D</h2>
    <p>This preview shows unsaved changes. Completed moves edit the draft;
      Save scene persists them.</p>
    <div className={styles.toolbar}>
      <button disabled={!!error || !valid || moving}
        onClick={() => runtime.current?.frame("perspective")}>Reset camera / fit scene</button>
      <button disabled={!!error || !valid || moving}
        onClick={() => runtime.current?.frame("top")}>Top view</button>
      <button disabled={!!error || !valid || moving}
        onClick={() => runtime.current?.frame("front")}>Front view</button>
      <button aria-pressed={moveEnabled}
        disabled={disabled || !!error || !valid || moving}
        onClick={() => setMoveEnabled((value) => !value)}>
        {moveEnabled ? "Movement handles on" : "Enable movement handles"}
      </button>
      <label>
        <input type="checkbox" checked={snapEnabled} disabled={moving || disabled}
          onChange={(event) => setSnapEnabled(event.target.checked)} /> Snap
      </label>
      <label>Step{" "}
        <select value={step} disabled={moving || disabled}
          style={{ background: "#191522", color: "#ffffff", padding: 10 }}
          onChange={(event) => setStep(Number(event.target.value))}>
          {[0.1, 0.5, 1, 5].map((value) =>
            <option key={value} value={value}>{value} units</option>)}
        </select>
      </label>
      <button disabled={!moving} onClick={() => runtime.current?.cancel()}>Cancel move</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!valid && <p>Complete numeric fields and positive platform sizes to display the draft.</p>}
    <canvas ref={canvas} width={800} height={450} tabIndex={0}
      className={styles.canvas} aria-label="Interactive 3D scene draft"
      aria-describedby="scene-preview-help" />
    <p id="scene-preview-help">
      Click an object to select it. Enable movement handles, then drag
      red X, green Y, or blue Z. Release to apply one edit; Escape cancels.
      Drag away from handles to orbit, scroll to zoom, or right-drag to pan.
      On touch screens, one finger orbits and two fingers zoom/pan.
    </p>
    <p>Handles move one axis at a time and keep coordinates within world bounds.
      They do not carry other objects or guarantee supported/reachable placement.
      Save scene validates geometry. Map snapping and 3D snapping have separate controls.</p>
  </section>;
}
