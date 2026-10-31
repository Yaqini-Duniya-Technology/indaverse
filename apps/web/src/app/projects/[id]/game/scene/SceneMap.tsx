"use client";

import { useId, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { SceneLayout } from "@/lib/gameScene";
import styles from "./sceneMap.module.css";

type Item = {
  key: string;
  kind: "platform" | "gem" | "spawn" | "exit";
  id: string;
  label: string;
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
};

type Drag = {
  pointerId: number;
  item: Item;
  startX: number;
  startZ: number;
  base: SceneLayout;
  next: SceneLayout;
};

function itemsFor(layout: SceneLayout): Item[] {
  return [
    ...layout.platforms.map((item, index): Item => ({
      key: `platform:${item.id}`, kind: "platform", id: item.id,
      label: `Platform ${index + 1} / top ${item.top}`,
      x: item.x, z: item.z, halfWidth: item.w / 2, halfDepth: item.d / 2,
    })),
    ...layout.collectibles.map((item, index): Item => ({
      key: `gem:${item.id}`, kind: "gem", id: item.id,
      label: `Gem ${index + 1} / height ${item.y}`,
      x: item.x, z: item.z, halfWidth: 0, halfDepth: 0,
    })),
    {
      key: "spawn", kind: "spawn", id: "spawn", label: "Player spawn",
      x: layout.spawn.x, z: layout.spawn.z, halfWidth: 0, halfDepth: 0,
    },
    {
      key: "exit", kind: "exit", id: "exit", label: "Exit gate",
      x: layout.exit.x, z: layout.exit.z, halfWidth: 0, halfDepth: 0,
    },
  ];
}

function moveItem(
  layout: SceneLayout, item: Item, x: number, z: number, snap: number,
): SceneLayout {
  const position = (value: number, halfSize: number) => {
    const snapped = snap > 0 ? Math.round(value / snap) * snap : value;
    return Number(Math.max(-50 + halfSize, Math.min(50 - halfSize, snapped)).toFixed(3));
  };
  const next = {
    x: position(x, item.halfWidth),
    z: position(z, item.halfDepth),
  };
  if (item.kind === "platform") {
    return {
      ...layout,
      platforms: layout.platforms.map((value) =>
        value.id === item.id ? { ...value, ...next } : value),
    };
  }
  if (item.kind === "gem") {
    return {
      ...layout,
      collectibles: layout.collectibles.map((value) =>
        value.id === item.id ? { ...value, ...next } : value),
    };
  }
  return { ...layout, [item.kind]: { ...layout[item.kind], ...next } };
}

export default function SceneMap({
  layout, disabled, selected, onSelect, onChange, onUndo, onRedo, canUndo, canRedo,
}: {
  layout: SceneLayout;
  disabled: boolean;
  selected: string;
  onSelect: (key: string) => void;
  onChange: (next: SceneLayout) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<SceneLayout | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [step, setStep] = useState(0.5);
  const patternId = useId().replaceAll(":", "");
  const shown = preview ?? layout;
  const items = itemsFor(shown);
  const selectedItem = items.find((item) => item.key === selected);
  const valid = items.every((item) =>
    [item.x, item.z, item.halfWidth, item.halfDepth].every(Number.isFinite) &&
    item.halfWidth >= 0 && item.halfDepth >= 0,
  );

  function coordinates(event: ReactPointerEvent<SVGSVGElement>) {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  }

  function cancelDrag() {
    drag.current = null;
    setPreview(null);
  }

  function finish(event: ReactPointerEvent<SVGSVGElement>, cancelled: boolean) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    setPreview(null);
    if (!cancelled && !disabled &&
        JSON.stringify(current.base) !== JSON.stringify(current.next)) {
      onChange(current.next);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return <section className={styles.panel} aria-label="Visual scene positioning">
    <h2>Position your scene</h2>
    <p>This is a top-down map of the 3D scene: X runs left/right and Z runs
      up/down. Select an object, then drag it or use the arrow keys.
      Shift moves five steps. Height does not change.</p>
    <div className={styles.toolbar}>
      <label>Selected object
        <select disabled={disabled || preview !== null}
          value={selectedItem ? selected : ""}
          onChange={(event) => onSelect(event.target.value)}>
          <option value="" disabled>Select an object</option>
          {items.map((item) => <option key={item.key} value={item.key}>
            {item.label}
          </option>)}
        </select>
      </label>
      <label className={styles.check}>
        <input type="checkbox" checked={snapEnabled}
          disabled={disabled || preview !== null}
          onChange={(event) => setSnapEnabled(event.target.checked)} />
        Snap to grid
      </label>
      <label>Grid / keyboard step
        <select value={step} disabled={disabled || preview !== null}
          onChange={(event) => setStep(Number(event.target.value))}>
          {[0.1, 0.5, 1, 5].map((value) =>
            <option key={value} value={value}>{value} units</option>)}
        </select>
      </label>
      <button disabled={disabled || preview !== null || !canUndo} onClick={onUndo}>Undo</button>
      <button disabled={disabled || preview !== null || !canRedo} onClick={onRedo}>Redo</button>
    </div>
    <p className={styles.legend}>
      Green: platforms / Gold: gems / Teal: spawn / Purple: exit.
      White outline: selected object. Markers are enlarged for selection.
    </p>
    {!valid ? <p role="status">Complete the numeric positions and sizes to display the map.</p> :
      <svg ref={svg} viewBox="-52 -52 104 104" role="group"
        aria-label="Scene positioning map"
        aria-describedby={`${patternId}-help`}
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        className={styles.map}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Escape") {
            event.preventDefault();
            cancelDrag();
            return;
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
            event.preventDefault();
            if (drag.current) return;
            if (event.shiftKey) onRedo(); else onUndo();
            return;
          }
          if (event.ctrlKey || event.metaKey || event.altKey || drag.current) return;
          const directions: Record<string, [number, number]> = {
            ArrowLeft: [-1, 0], ArrowRight: [1, 0],
            ArrowUp: [0, -1], ArrowDown: [0, 1],
          };
          const direction = directions[event.key];
          if (!direction || !selectedItem) return;
          event.preventDefault();
          const distance = step * (event.shiftKey ? 5 : 1);
          onChange(moveItem(
            layout, selectedItem,
            selectedItem.x + direction[0] * distance,
            selectedItem.z + direction[1] * distance,
            snapEnabled ? step : 0,
          ));
        }}
        onPointerDown={(event) => {
          if (disabled || drag.current || event.button !== 0) return;
          const target = event.target instanceof Element
            ? event.target.closest("[data-item]") : null;
          const item = items.find((value) => value.key === target?.getAttribute("data-item"));
          const point = coordinates(event);
          if (!item || !point) return;
          event.preventDefault();
          event.currentTarget.focus();
          onSelect(item.key);
          drag.current = {
            pointerId: event.pointerId, item,
            startX: point.x, startZ: point.y,
            base: layout, next: layout,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (disabled || !current || current.pointerId !== event.pointerId) return;
          const point = coordinates(event);
          if (!point) return;
          current.next = moveItem(
            current.base, current.item,
            current.item.x + point.x - current.startX,
            current.item.z + point.y - current.startZ,
            snapEnabled ? step : 0,
          );
          setPreview(current.next);
        }}
        onPointerUp={(event) => finish(event, false)}
        onPointerCancel={(event) => finish(event, true)}
        onLostPointerCapture={(event) => finish(event, true)}
        onBlur={cancelDrag}>
        <defs>
          <pattern id={patternId} width={step} height={step} patternUnits="userSpaceOnUse">
            <path d={`M ${step} 0 L 0 0 0 ${step}`} fill="none"
              stroke="#667389" strokeWidth="0.05" opacity="0.3" />
          </pattern>
        </defs>
        <rect x="-50" y="-50" width="100" height="100" fill="#142638" />
        <rect x="-50" y="-50" width="100" height="100" fill={`url(#${patternId})`} />
        <path d="M -50 0 H 50 M 0 -50 V 50" stroke="#8797af" strokeWidth="0.15" />
        {items.map((item) => <g key={item.key} data-item={item.key}
          tabIndex={disabled ? -1 : 0} role="button"
          aria-label={`${item.label}, X ${item.x}, Z ${item.z}`}
          aria-pressed={selected === item.key}
          onFocus={() => onSelect(item.key)}
          onKeyDown={(event) => {
            if (!disabled && ["Enter", " "].includes(event.key)) {
              event.preventDefault();
              onSelect(item.key);
              svg.current?.focus();
            }
          }}
          className={styles.object}
          stroke={selected === item.key ? "#ffffff" : "#0d1824"}
          strokeWidth={selected === item.key ? 0.45 : 0.2}
          fill={item.kind === "platform" ? "#609679" :
            item.kind === "gem" ? "#ffd675" :
            item.kind === "spawn" ? "#5be0cc" : "#b89ee7"}>
          <title>{item.label}: X {item.x}, Z {item.z}</title>
          {item.kind === "platform" ? <rect
            x={item.x - item.halfWidth} y={item.z - item.halfDepth}
            width={item.halfWidth * 2} height={item.halfDepth * 2} /> :
            item.kind === "gem" ? <path
              d={`M ${item.x} ${item.z - 1.2} l 1.2 1.2 -1.2 1.2 -1.2 -1.2 Z`} /> :
            item.kind === "spawn" ? <circle cx={item.x} cy={item.z} r="1.2" /> :
            <rect x={item.x - 1.2} y={item.z - 1.2} width="2.4" height="2.4" />}
        </g>)}
        <rect x="-50" y="-50" width="100" height="100" fill="none"
          stroke="#a6b5cb" strokeWidth="0.2" pointerEvents="none" />
      </svg>}
    <p role="status">{selectedItem
      ? `${selectedItem.label}: X ${selectedItem.x}, Z ${selectedItem.z}.`
      : "Select an object from the list or map."}</p>
    <p id={`${patternId}-help`}>
      Drag previews commit when released. Escape or a cancelled drag restores
      the previous position. Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z work while the map
      is focused. Undo also covers numeric edits, additions, and removals.
    </p>
    <p>Moving a platform does not carry gems, spawn, or exit with it.
      Overlapping objects can be selected from the list. Save scene validates
      placement; use Play saved scene to check reachability.</p>
  </section>;
}
