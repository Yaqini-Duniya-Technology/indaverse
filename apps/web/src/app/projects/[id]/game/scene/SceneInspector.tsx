"use client";

import type { SceneLayout } from "@/lib/gameScene";
import styles from "./scene.module.css";

export default function SceneInspector({ layout, selected, disabled, onChange }: {
  layout: SceneLayout;
  selected: string;
  disabled: boolean;
  onChange: (next: SceneLayout) => void;
}) {
  const platform = selected.startsWith("platform:")
    ? layout.platforms.find((item) => `platform:${item.id}` === selected) : undefined;
  const gem = selected.startsWith("gem:")
    ? layout.collectibles.find((item) => `gem:${item.id}` === selected) : undefined;
  const fixed = selected === "spawn" || selected === "exit" ? selected : null;
  const point = gem ?? (fixed ? layout[fixed] : undefined);
  const label = platform
    ? `Platform ${layout.platforms.indexOf(platform) + 1}`
    : gem ? `Gem ${layout.collectibles.indexOf(gem) + 1}`
    : fixed === "spawn" ? "Player spawn" : fixed === "exit" ? "Exit gate" : "";

  function update(field: string, value: number) {
    if (disabled) return;
    if (platform) {
      onChange({
        ...layout,
        platforms: layout.platforms.map((item) =>
          item.id === platform.id ? { ...item, [field]: value } : item),
      });
    } else if (gem) {
      onChange({
        ...layout,
        collectibles: layout.collectibles.map((item) =>
          item.id === gem.id ? { ...item, [field]: value } : item),
      });
    } else if (fixed) {
      onChange({ ...layout, [fixed]: { ...layout[fixed], [field]: value } });
    }
  }

  const fields = platform ? [
    { key: "x", label: "X", value: platform.x, min: -50, max: 50 },
    { key: "top", label: "Y / top height", value: platform.top, min: 0, max: 20 },
    { key: "z", label: "Z", value: platform.z, min: -50, max: 50 },
    { key: "w", label: "Width", value: platform.w, min: 1, max: 40 },
    { key: "d", label: "Depth", value: platform.d, min: 1, max: 40 },
  ] : point ? [
    { key: "x", label: "X", value: point.x, min: -50, max: 50 },
    { key: "y", label: gem ? "Y / gem centre" : "Y / feet level",
      value: point.y, min: gem ? 0.3 : 0, max: 25 },
    { key: "z", label: "Z", value: point.z, min: -50, max: 50 },
  ] : [];

  return <section className={styles.panel} aria-label="Selected object inspector">
    <h2>Selected object</h2>
    {!label ? <p>Select an object in the map, its dropdown, or the 3D preview.
      Removed objects become available again if you Undo their removal.</p> : <>
      <h3>{label}</h3>
      <p>Edits update the draft and use the existing undo/redo history.
        Selection alone does not change the scene or its saved version.</p>
      <fieldset disabled={disabled}>
        <div className={styles.fields}>
          {fields.map((field) => <label key={field.key}>{field.label}
            <input type="number" step="0.1" min={field.min} max={field.max}
              value={Number.isFinite(field.value) ? field.value : ""}
              onChange={(event) => update(field.key, event.target.valueAsNumber)} />
          </label>)}
        </div>
      </fieldset>
      <p>Height and size edits do not move other objects.
        Save scene validates placement; Play saved scene tests the saved result.</p>
    </>}
  </section>;
}
