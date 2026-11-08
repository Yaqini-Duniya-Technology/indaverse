"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { GameProject } from "@/lib/game";
import type { SceneLayout } from "@/lib/gameScene";
import styles from "./play.module.css";

type World = {
  x: number; y: number; z: number; vy: number;
  grounded: boolean; gems: boolean[]; won: boolean; checkpointReached: boolean;
};

function initial(layout: SceneLayout): World {
  return {
    x: layout.spawn.x, y: layout.spawn.y, z: layout.spawn.z,
    vy: 0, grounded: true,
    gems: layout.collectibles.map(() => false), won: false, checkpointReached: false,
  };
}

function action(code: string) {
  const actions: Record<string, string> = {
    KeyA: "left", ArrowLeft: "left",
    KeyD: "right", ArrowRight: "right",
    KeyW: "forward", ArrowUp: "forward",
    KeyS: "back", ArrowDown: "back",
    Space: "jump",
  };
  return actions[code] || "";
}

export default function ThreeGame({ game, layout, sceneVersion }: {
  game: GameProject; layout: SceneLayout; sceneVersion: number;
}) {
  const surfaces = layout.platforms;
  const collectibles = layout.collectibles;
  const exit = layout.exit;
  const goal = layout.required_gems ?? collectibles.length;
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<World>(initial(layout));
  const keys = useRef(new Map<string, string>());
  const touches = useRef(new Map<number, string>());
  const jump = useRef(false);
  const running = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"ready" | "playing" | "paused" | "won">("ready");
  const [count, setCount] = useState(0);
  const [checkpointActive, setCheckpointActive] = useState(false);

  function clearInput() {
    keys.current.clear();
    touches.current.clear();
    jump.current = false;
  }

  function pause() {
    running.current = false;
    clearInput();
    setStatus((value) => value === "playing" ? "paused" : value);
  }

  function start() {
    if (!ready || world.current.won) return;
    clearInput();
    canvas.current?.focus();
    running.current = true;
    setStatus("playing");
  }

  function restart() {
    running.current = false;
    clearInput();
    world.current = initial(layout);
    setCount(0);
    setCheckpointActive(false);
    setStatus("ready");
  }

  useEffect(() => {
    const surface = canvas.current;
    if (!surface) return;

    setReady(false);
    setError("");

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: surface,
        antialias: true,
        powerPreference: "low-power",
      });
    } catch {
      setError("The 3D renderer could not start. Check browser hardware acceleration and WebGL support.");
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#172b40");
    scene.fog = new THREE.Fog("#172b40", 25, 65);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    scene.add(new THREE.HemisphereLight("#dcefff", "#365043", 2));

    const light = new THREE.DirectionalLight("#fff0cf", 2);
    light.position.set(-6, 12, 8);
    scene.add(light);

    function box(w: number, h: number, d: number, color: string) {
      return new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
      );
    }

    const water = box(100, 0.15, 100, "#255879");
    water.position.set(0, -3, -5);
    scene.add(water);

    surfaces.forEach((platform) => {
      const height = 0.6;
      const mesh = box(platform.w, height, platform.d, platform.top > 0 ? "#9d8263" : "#609679");
      mesh.position.set(platform.x, platform.top - height / 2, platform.z);
      scene.add(mesh);
    });

    const player = box(0.6, 1.1, 0.6, "#5be0cc");
    scene.add(player);

    const gems = collectibles.map((point) => {
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.3),
        new THREE.MeshStandardMaterial({
          color: "#ffd675",
          emissive: "#8a5a10",
          emissiveIntensity: 0.35,
        }),
      );
      mesh.position.set(point.x, point.y, point.z);
      scene.add(mesh);
      return mesh;
    });

    const gateMaterial = new THREE.MeshStandardMaterial({
      color: "#a18bc9",
      roughness: 0.6,
    });
    const gate = new THREE.Group();
    for (const x of [-0.75, 0.75]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.2), gateMaterial);
      post.position.set(x, 1.1, 0);
      gate.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.2, 0.2), gateMaterial);
    beam.position.y = 2.2;
    gate.add(beam);
    gate.position.set(exit.x, exit.y, exit.z);
    scene.add(gate);
    const checkpoint = layout.checkpoint;
    if (checkpoint) {
      const marker = new THREE.Mesh(new THREE.RingGeometry(0.47, 0.62, 24),
        new THREE.MeshBasicMaterial({color: 0x43d9ff, side: THREE.DoubleSide}));
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(checkpoint.x, checkpoint.y + 0.02, checkpoint.z);
      scene.add(marker);
    }

    let frame = 0;
    let last = 0;
    let accumulator = 0;
    let failed = false;

    function tick(dt: number) {
      const state = world.current;
      if (!running.current || state.won) return;

      const inputs = new Set([...keys.current.values(), ...touches.current.values()]);
      let dx = Number(inputs.has("right")) - Number(inputs.has("left"));
      let dz = Number(inputs.has("back")) - Number(inputs.has("forward"));
      const length = Math.hypot(dx, dz);
      if (length > 0) {
        dx /= length;
        dz /= length;
      }
      state.x = Math.max(-49.7, Math.min(49.7, state.x + dx * 5 * dt));
      state.z = Math.max(-49.7, Math.min(49.7, state.z + dz * 5 * dt));

      if (jump.current && state.grounded) {
        state.vy = 7;
        state.grounded = false;
      }
      jump.current = false;

      const previousFeet = state.y;
      state.vy = Math.max(-18, state.vy - 18 * dt);
      state.y += state.vy * dt;
      state.grounded = false;

      if (state.vy <= 0) {
        for (const platform of [...surfaces].sort((a, b) => b.top - a.top)) {
          const inside =
            state.x + 0.3 > platform.x - platform.w / 2 &&
            state.x - 0.3 < platform.x + platform.w / 2 &&
            state.z + 0.3 > platform.z - platform.d / 2 &&
            state.z - 0.3 < platform.z + platform.d / 2;
          if (inside && previousFeet >= platform.top && state.y <= platform.top) {
            state.y = platform.top;
            state.vy = 0;
            state.grounded = true;
            break;
          }
        }
      }

      if (checkpoint && !state.checkpointReached && state.grounded && Math.abs(state.y - checkpoint.y) < 0.08 &&
          Math.hypot(state.x - checkpoint.x, state.z - checkpoint.z) < 0.62) {
        state.checkpointReached = true;
        setCheckpointActive(true);
      }

      if (state.y < -5) {
        const respawn = state.checkpointReached && checkpoint ? checkpoint : layout.spawn;
        state.x = respawn.x;
        state.y = respawn.y;
        state.z = respawn.z;
        state.vy = 0;
        state.grounded = true;
        return;
      }

      collectibles.forEach((point, index) => {
        if (!state.gems[index] &&
            Math.hypot(state.x - point.x, state.y + 0.55 - point.y, state.z - point.z) < 0.85) {
          state.gems[index] = true;
          setCount(state.gems.filter(Boolean).length);
        }
      });

      if (state.gems.filter(Boolean).length >= (layout.required_gems ?? collectibles.length) &&
          Math.abs(state.x - exit.x) < 0.85 &&
          Math.abs(state.z - exit.z) < 0.65 &&
          state.y < exit.y + 1 && state.y >= exit.y - 0.05) {
        state.won = true;
        running.current = false;
        clearInput();
        setStatus("won");
      }
    }

    function draw() {
      const state = world.current;
      player.position.set(state.x, state.y + 0.55, state.z);
      gems.forEach((gem, index) => {
        gem.visible = !state.gems[index];
        if (running.current) gem.rotation.y += 0.025;
      });
      gateMaterial.color.set(state.gems.every(Boolean) ? "#90edac" : "#a18bc9");
      camera.position.set(state.x, state.y + 13, state.z + 14);
      camera.lookAt(state.x, state.y, state.z - 4);
      renderer.render(scene, camera);
    }

    function fail(message: string) {
      failed = true;
      cancelAnimationFrame(frame);
      running.current = false;
      clearInput();
      setReady(false);
      setError(message);
    }

    function resize() {
      if (failed) return;
      const width = Math.max(1, Math.round(surface!.getBoundingClientRect().width));
      const height = Math.max(1, Math.round(width * 9 / 16));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    function loop(time: number) {
      if (failed) return;
      const elapsed = last ? Math.min(0.1, (time - last) / 1000) : 0;
      last = time;
      if (running.current) {
        accumulator += elapsed;
        while (accumulator >= 1 / 60) {
          tick(1 / 60);
          accumulator -= 1 / 60;
        }
      } else {
        accumulator = 0;
      }
      try {
        draw();
      } catch {
        fail("3D rendering stopped. Reload the page to retry.");
        return;
      }
      frame = requestAnimationFrame(loop);
    }

    function lost(event: Event) {
      event.preventDefault();
      fail("The browser lost its 3D graphics context. Reload this page to retry.");
    }
    function hidden() {
      if (document.hidden) pause();
    }

    const observer = new ResizeObserver(resize);
    observer.observe(surface);
    surface.addEventListener("webglcontextlost", lost);
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", hidden);

    resize();
    setReady(true);
    frame = requestAnimationFrame(loop);

    return () => {
      failed = true;
      running.current = false;
      clearInput();
      cancelAnimationFrame(frame);
      observer.disconnect();
      surface.removeEventListener("webglcontextlost", lost);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", hidden);

      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          const list = Array.isArray(object.material) ? object.material : [object.material];
          list.forEach((material) => materials.add(material));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      renderer.dispose();
      // Keep the canvas context usable when this effect starts again.
    };
  }, [layout]);

  return <>
    <header>
      <p className={styles.eyebrow}>PRIVATE PLAYABLE TEST / 3D</p>
      <h1>{game.title}</h1>
      <p>Saved blueprint version {game.version}. Player: {
        game.characters.find((item) => item.role === "player")?.name || "Explorer"
      }.</p>
      <p>{sceneVersion > 0
        ? `Playing saved 3D scene version ${sceneVersion}.`
        : "Playing the starter scene. Save your own scene in the 3D scene editor."}</p>
      <p>This course uses placeholder shapes and fixed rules.
        Written levels and artwork remain design references.</p>
    </header>

    {error && <div role="alert">
      <p>{error}</p>
      <button onClick={() => window.location.reload()}>Reload 3D test</button>
    </div>}

    <div className={styles.toolbar}>
      <button disabled={!ready || status === "playing" || status === "won"}
        onClick={start}>{status === "paused" ? "Resume" : "Start"}</button>
      <button disabled={!ready || status !== "playing"} onClick={pause}>Pause</button>
      <button disabled={!ready} onClick={restart}>Restart</button>
      <span role="status">{status === "won"
        ? goal === collectibles.length ? "Completed! All gems collected and exit reached." : "Completed! Gem objective met and exit reached."
        : `${status} / Gems ${count} of ${collectibles.length}`}</span>
    </div>

    {checkpointActive && <p role="status">Checkpoint reached</p>}
    <p id="three-instructions">
      {goal === collectibles.length ? "Collect every gold gem, then enter the exit gate." : `Collect ${goal} gems, then enter the exit gate.`}
      Move with WASD or arrow keys. W moves toward the distant islands.
      Space jumps; Escape pauses. Jump across water gaps and onto the raised platform.
      {layout.checkpoint ? "The blue ring is a checkpoint. Falling keeps collected gems." : "Falling returns you to the saved spawn and keeps collected gems."}
    </p>

    <canvas ref={canvas} width={800} height={450} tabIndex={0}
      style={{ aspectRatio: "16 / 9" }}
      aria-label="3D island platformer test" aria-describedby="three-instructions"
      onBlur={pause}
      onKeyDown={(event) => {
        if (event.code === "Escape") {
          event.preventDefault();
          pause();
          return;
        }
        const input = action(event.code);
        if (!input) return;
        event.preventDefault();
        if (!running.current) return;
        if (input === "jump") {
          if (!event.repeat) jump.current = true;
        } else {
          keys.current.set(event.code, input);
        }
      }}
      onKeyUp={(event) => {
        if (action(event.code)) event.preventDefault();
        keys.current.delete(event.code);
      }}>
      This test requires browser support for WebGL.
    </canvas>

    <div className={styles.touch} aria-label="3D touch controls">
      {["left", "forward", "back", "right", "jump"].map((input) => (
        <button key={input} disabled={!ready || status !== "playing"}
          onPointerDown={(event) => {
            event.preventDefault();
            if (!running.current) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            touches.current.set(event.pointerId, input);
            if (input === "jump") jump.current = true;
          }}
          onPointerUp={(event) => touches.current.delete(event.pointerId)}
          onPointerCancel={(event) => touches.current.delete(event.pointerId)}
          onLostPointerCapture={(event) => touches.current.delete(event.pointerId)}
          onKeyDown={(event) => {
            if (!["Enter", " "].includes(event.key)) return;
            event.preventDefault();
            if (!running.current) return;
            if (input === "jump") {
              if (!event.repeat) jump.current = true;
            } else {
              keys.current.set(`button:${input}`, input);
            }
          }}
          onKeyUp={() => keys.current.delete(`button:${input}`)}
          onBlur={() => keys.current.delete(`button:${input}`)}>
          {input === "jump" ? "Jump" : `Move ${input}`}
        </button>
      ))}
    </div>

    <p>Progress lasts for this visit. Restart resets gems and position.
      Switching tabs pauses play. Platforms support landing from above.</p>
  </>;
}
