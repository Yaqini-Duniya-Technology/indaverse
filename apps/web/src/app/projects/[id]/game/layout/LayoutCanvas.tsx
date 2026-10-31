"use client";

import {
  useRef, useState,
  type PointerEvent, type KeyboardEvent,
} from "react";
import type { PlayLayout } from "@/lib/gamePlay";
import styles from "./layoutCanvas.module.css";

type Target = {
  kind: "spawn" | "exit" | "platform" | "collectible";
  id?: string;
};

type Drag = {
  pointerId: number;
  target: Target;
  origin: { x: number; y: number };
  position: { x: number; y: number };
};

function position(layout: PlayLayout, target: Target) {
  if (target.kind === "spawn" || target.kind === "exit") {
    return layout[target.kind];
  }
  return target.kind === "platform"
    ? layout.platforms.find((item) => item.id === target.id)
    : layout.collectibles.find((item) => item.id === target.id);
}

function move(
  layout: PlayLayout, target: Target, x: number, y: number,
): PlayLayout {
  const current = position(layout, target);
  if (!current) return layout;

  let minX = 0, minY = 0, maxX = 776, maxY = 366;

  if (target.kind === "exit") {
    maxX = 764;
    maxY = 350;
  } else if (target.kind === "collectible") {
    minX = 10;
    minY = 10;
    maxX = 790;
    maxY = 390;
  } else if (target.kind === "platform") {
    const platform = layout.platforms.find((item) => item.id === target.id);
    if (!platform) return layout;
    maxX = Math.max(0, 800 - platform.w);
    maxY = Math.max(0, 400 - platform.h);
  }

  const next = {
    x: Math.round(Math.max(minX, Math.min(maxX, x))),
    y: Math.round(Math.max(minY, Math.min(maxY, y))),
  };

  if (next.x === current.x && next.y === current.y) return layout;

  if (target.kind === "spawn" || target.kind === "exit") {
    return { ...layout, [target.kind]: next };
  }

  if (target.kind === "platform") {
    return {
      ...layout,
      platforms: layout.platforms.map((item) =>
        item.id === target.id ? { ...item, ...next } : item),
    };
  }

  return {
    ...layout,
    collectibles: layout.collectibles.map((item) =>
      item.id === target.id ? { ...item, ...next } : item),
  };
}

export default function LayoutCanvas({
  layout, disabled, onChange, onGestureStart, onGestureEnd,
}: {
  layout: PlayLayout;
  disabled: boolean;
  onChange: (next: PlayLayout) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [selected, setSelected] = useState("");
  const [announcement, setAnnouncement] = useState("");

  function coordinates(clientX: number, clientY: number) {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    return new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  }

  function identify(target: Target) {
    return `${target.kind}:${target.id || ""}`;
  }

  function begin(
    event: PointerEvent<SVGGElement>, target: Target, label: string,
  ) {
    if (disabled || !event.isPrimary || event.button !== 0 || drag.current) return;

    const origin = coordinates(event.clientX, event.clientY);
    const current = position(layout, target);
    if (!origin || !current) return;

    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);

    onGestureStart();
    setSelected(identify(target));
    setAnnouncement(`${label} selected.`);
    drag.current = {
      pointerId: event.pointerId,
      target,
      origin,
      position: { x: current.x, y: current.y },
    };
  }

  function dragging(event: PointerEvent<SVGGElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId || disabled) return;

    const point = coordinates(event.clientX, event.clientY);
    if (!point) return;

    event.preventDefault();
    const next = move(
      layout,
      active.target,
      active.position.x + point.x - active.origin.x,
      active.position.y + point.y - active.origin.y,
    );
    if (next !== layout) onChange(next);
  }

  function finish(event: PointerEvent<SVGGElement>, label: string) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;

    drag.current = null;
    onGestureEnd();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const current = position(layout, active.target);
    if (current) {
      setAnnouncement(`${label}: X ${current.x}, Y ${current.y}.`);
    }
  }

  function keyboard(
    event: KeyboardEvent<SVGGElement>, target: Target, label: string,
  ) {
    if (disabled || drag.current) return;

    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction) return;

    event.preventDefault();
    const current = position(layout, target);
    if (!current) return;

    const step = event.shiftKey ? 10 : 1;
    const next = move(
      layout, target,
      current.x + direction[0] * step,
      current.y + direction[1] * step,
    );
    if (next !== layout) onChange(next);

    const moved = position(next, target);
    if (moved) {
      setAnnouncement(`${label}: X ${moved.x}, Y ${moved.y}.`);
    }
  }

  function handlers(target: Target, label: string) {
    const current = position(layout, target);
    return {
      role: "button" as const,
      tabIndex: disabled ? -1 : 0,
      "aria-disabled": disabled,
      "aria-label": `${label}, X ${current?.x}, Y ${current?.y}. Use arrow keys to move.`,
      "data-selected": selected === identify(target),
      className: styles.object,
      onFocus: () => setSelected(identify(target)),
      onPointerDown: (event: PointerEvent<SVGGElement>) =>
        begin(event, target, label),
      onPointerMove: dragging,
      onPointerUp: (event: PointerEvent<SVGGElement>) => finish(event, label),
      onPointerCancel: (event: PointerEvent<SVGGElement>) => finish(event, label),
      onLostPointerCapture: (event: PointerEvent<SVGGElement>) =>
        finish(event, label),
      onKeyDown: (event: KeyboardEvent<SVGGElement>) =>
        keyboard(event, target, label),
    };
  }

  return <section aria-label="Visual layout editor">
    <p className={styles.help}>
      Drag objects with a mouse or finger. Tab to an object and use arrow
      keys to move 1 pixel, or Shift + Arrow to move 10 pixels.
      Teal: spawn. Purple: exit. Green: platforms. Gold: gems.
      Changes remain unsaved until you select Save layout.
    </p>

    <svg ref={svg} viewBox="0 0 800 400" className={styles.map}
      role="group" aria-label="Interactive draft level map">
      {layout.platforms.map((item, index) => (
        <g key={`platform:${item.id}`}
          {...handlers(
            { kind: "platform", id: item.id }, `Platform ${index + 1}`,
          )}>
          <rect x={item.x} y={item.y}
            width={item.w} height={item.h} fill="#82b593" />
        </g>
      ))}

      <g {...handlers({ kind: "spawn" }, "Player spawn")}>
        <rect x={layout.spawn.x} y={layout.spawn.y}
          width={24} height={34} fill="#62d3cb" />
      </g>

      <g {...handlers({ kind: "exit" }, "Exit")}>
        <rect x={layout.exit.x} y={layout.exit.y}
          width={36} height={50} fill="#bda4ff" />
      </g>

      {layout.collectibles.map((item, index) => (
        <g key={`collectible:${item.id}`}
          {...handlers(
            { kind: "collectible", id: item.id }, `Collectible ${index + 1}`,
          )}>
          <circle cx={item.x} cy={item.y} r={10} fill="#f6cf70" />
        </g>
      ))}
    </svg>

    <p className={styles.help} role="status" aria-live="polite">
      {announcement}
    </p>
    <p className={styles.help}>
      Use the coordinate fields below for precise placement and platform sizes.
      Save checks for invalid overlaps; test reachability in the playable game.
    </p>
  </section>;
}
