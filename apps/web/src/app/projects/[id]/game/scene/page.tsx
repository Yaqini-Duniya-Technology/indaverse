"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getGame } from "@/lib/game";
import {
  defaultScene, courtyardScene, getGameScene, saveGameScene,
  type SceneLayout, type ScenePoint,
} from "@/lib/gameScene";
import styles from "./scene.module.css";
import SceneMap from "./SceneMap";
import SceneInspector from "./SceneInspector";
import SceneDraftRecovery from "./SceneDraftRecovery";
import dynamic from "next/dynamic";

const ScenePreview = dynamic(() => import("./ScenePreview"), {
  ssr: false,
  loading: () => <p aria-busy="true">Loading 3D draft preview...</p>,
});

export default function ScenePage() {
  const params = useParams();
  return <SceneEditor key={String(params.id)} projectId={Number(params.id)} />;
}

function serialize(layout: SceneLayout): string {
  return JSON.stringify(layout, (_key, value: unknown) => {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("Complete every numeric field before saving or exporting.");
    }
    return value;
  }, 2);
}

function SceneEditor({ projectId }: { projectId: number }) {
  const [data, setData] = useState<SceneLayout>(defaultScene);
  const [baseline, setBaseline] = useState("");
  const [version, setVersion] = useState(0);
  const [title, setTitle] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const [past, setPast] = useState<SceneLayout[]>([]);
  const [future, setFuture] = useState<SceneLayout[]>([]);
  const [mapEpoch, setMapEpoch] = useState(0);
  const [selected, setSelected] = useState("spawn");
  const dirty = ready && JSON.stringify(data) !== baseline;

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!Number.isSafeInteger(projectId) || projectId < 1) {
          throw new Error("Invalid project ID.");
        }
        const game = await getGame(projectId);
        if (game.dimension !== "3d") {
          throw new Error("Save a 3D blueprint before opening the 3D scene editor.");
        }
        let layout = defaultScene();
        let nextVersion = 0;
        try {
          const saved = await getGameScene(projectId);
          layout = saved.layout;
          nextVersion = saved.version;
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 404 &&
                err.message === "No 3D scene saved yet.")) throw err;
        }
        if (!active) return;
        setTitle(game.title);
        setData(layout);
        setBaseline(JSON.stringify(layout));
        setVersion(nextVersion);
        setReady(true);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load scene.");
      }
    })();
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirty && !busy) return;
      event.preventDefault();
      event.returnValue = "";
    }
    function navigate(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 ||
          event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element
        ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement) ||
          target.target === "_blank" || target.hasAttribute("download")) return;
      const destination = new URL(target.href);
      if (destination.href === window.location.href) return;
      if (busy || (dirty && !window.confirm("Leave without saving this scene? Export your draft first if needed."))) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty, busy]);

  function change(next: SceneLayout) {
    if (lock.current || JSON.stringify(next) === JSON.stringify(data)) return;
    setPast((items) => [...items.slice(-49), structuredClone(data)]);
    setFuture([]);
    setData(next);
    setNotice("");
  }

  function undo() {
    if (lock.current || past.length === 0) return;
    setFuture((items) => [...items.slice(-49), structuredClone(data)]);
    setData(structuredClone(past[past.length - 1]));
    setPast((items) => items.slice(0, -1));
    setNotice("Undid the last scene edit. Save scene to persist it.");
  }

  function redo() {
    if (lock.current || future.length === 0) return;
    setPast((items) => [...items.slice(-49), structuredClone(data)]);
    setData(structuredClone(future[future.length - 1]));
    setFuture((items) => items.slice(0, -1));
    setNotice("Redid the scene edit. Save scene to persist it.");
  }

  async function save() {
    if (lock.current || !ready || blocked) return;
    try {
      serialize(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Complete all numeric fields.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveGameScene(projectId, data, version);
      setData(saved.layout);
      setBaseline(JSON.stringify(saved.layout));
      setVersion(saved.version);
      setNotice(`Scene saved. Version ${saved.version}. Open Play saved scene to test it.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save scene.");
      if (err instanceof ApiError && err.status === 409) setBlocked(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function reload() {
    if (lock.current) return;
    if (dirty && !window.confirm("Replace your scene draft with the latest saved scene? Export it first if needed.")) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const game = await getGame(projectId);
      if (game.dimension !== "3d") throw new Error("The saved blueprint is no longer 3D.");
      let layout = defaultScene();
      let nextVersion = 0;
      try {
        const saved = await getGameScene(projectId);
        layout = saved.layout;
        nextVersion = saved.version;
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404 &&
              err.message === "No 3D scene saved yet.")) throw err;
      }
      setTitle(game.title);
      setData(layout);
      setBaseline(JSON.stringify(layout));
      setVersion(nextVersion);
      setBlocked(false);
      setPast([]);
      setFuture([]);
      setMapEpoch((value) => value + 1);
      setSelected("spawn");
      setNotice("Latest scene loaded. Undo history cleared.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load latest scene.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function exportDraft() {
    try {
      const content = serialize(data);
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `indaverse-${projectId}-3d-scene-draft.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to export draft.");
    }
  }

  function point(field: "spawn" | "exit", axis: keyof ScenePoint, value: number) {
    change({ ...data, [field]: { ...data[field], [axis]: value } });
  }

  return <main className={styles.page}><div className={styles.container}>
    <nav className={styles.nav}>
      <Link href={`/projects/${projectId}`}>Back to project</Link>
      <Link href={`/projects/${projectId}/game`}>Game Studio</Link>
      <Link href={`/projects/${projectId}/game/play`}>Play saved scene</Link>
    </nav>
    <h1>{title || "3D scene editor"}</h1>
    <p>Set platform positions, the player spawn, gems, and the exit.
      The player uses saved settings. Written levels and artwork remain design references.</p>
    {error && <p className={styles.alert} role="alert">{error}</p>}
    {!ready ? <p>{error ? "Return to Game Studio or reload this page to retry." : "Loading scene..."}</p> : <>
      <div className={styles.toolbar}>
        <span>{version ? `Saved scene version ${version}` : "Unsaved starter scene"} / {dirty ? "Unsaved changes" : "Draft up to date"}</span>
        <button disabled={busy || blocked || (!dirty && version > 0)} onClick={() => void save()}>
          {busy ? "Please wait..." : "Save scene"}
        </button>
        <button disabled={busy} onClick={() => void reload()}>Load latest</button>
        <button disabled={busy} onClick={exportDraft}>Export scene draft</button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {blocked && <p className={styles.alert}>Another tab saved a newer scene. Export your draft, then load and review the latest scene before saving.</p>}
      <SceneDraftRecovery
        projectId={projectId} data={data} version={version}
        dirty={dirty} disabled={busy}
        onApply={(recovered) => {
          if (lock.current) return false;
          if (!window.confirm(
            "Replace this scene draft with the reviewed recovery copy? Export your current draft first if needed."
          )) return false;
          change(structuredClone(recovered));
          setMapEpoch((value) => value + 1);
          setSelected("spawn");
          setError("");
          setNotice("Recovery restored to the draft. Review it, then Save scene. The current save version was preserved.");
          return true;
        }}
      />
      <fieldset disabled={busy}>
        <section className={styles.panel}>
          <h2>3D scene templates</h2>
          <button type="button" onClick={() => {
            if (dirty && !window.confirm("Replace unsaved scene edits with this template?")) return;
            change(defaultScene()); setMapEpoch(value => value + 1); setSelected("spawn");
          }}>Use Island jumps</button>{" "}
          <button type="button" onClick={() => {
            if (dirty && !window.confirm("Replace unsaved scene edits with this template?")) return;
            change(courtyardScene()); setMapEpoch(value => value + 1); setSelected("spawn");
          }}>Use Checkpoint courtyard</button>
        </section>
        <section className={styles.panel}>
          <h2>Checkpoint trigger and exit objective</h2>
          <label>Gems required (blank for all)
            <input type="number" min={0} max={data.collectibles.length} step={1} value={data.required_gems ?? ""}
              onChange={event => change({...data, required_gems: event.target.value === "" ? undefined : event.target.valueAsNumber})} />
          </label>
          {data.required_gems !== undefined && data.required_gems > data.collectibles.length &&
            <p role="alert">The goal exceeds the number of gems in this scene.</p>}
          <p>Set a checkpoint on a platform. Walking into its ring changes where the player respawns.</p>
          {data.checkpoint ? <>
            <div className={styles.fields}>{(["x", "y", "z"] as const).map(axis => <NumberField
              key={axis} label={`Checkpoint ${axis.toUpperCase()}`} value={data.checkpoint![axis]}
              min={axis === "y" ? 0 : -50} max={axis === "y" ? 25 : 50}
              onChange={value => change({...data, checkpoint: {...data.checkpoint!, [axis]: value}})} />)}</div>
            <button type="button" onClick={() => change({...data, checkpoint: undefined})}>Remove checkpoint trigger</button>
          </> : <button type="button" onClick={() => change({...data, checkpoint: {...data.spawn}})}>Add checkpoint trigger</button>}
        </section>
        <SceneInspector layout={data} selected={selected}
          disabled={busy} onChange={change} />
        <SceneMap key={mapEpoch} layout={data} disabled={busy}
          selected={selected} onSelect={setSelected}
          onChange={change} onUndo={undo} onRedo={redo}
          canUndo={past.length > 0} canRedo={future.length > 0} />
        <ScenePreview layout={data} selected={selected}
          onSelect={setSelected} disabled={busy}
          onCommit={(next, source) => {
            if (lock.current || JSON.stringify(data) !== JSON.stringify(source)) {
              return false;
            }
            change(next);
            return true;
          }} />
        <section className={styles.panel}>
          <h2>Player spawn and exit</h2>
          <p>X moves left/right, Z moves forward/back, and Y is height.
            Spawn and exit Y must equal the top of a supporting platform.
            World X and Z run from -50 to 50.</p>
          {(["spawn", "exit"] as const).map((field) => <div key={field}>
            <h3>{field === "spawn" ? "Player spawn" : "Exit gate"}</h3>
            <div className={styles.fields}>
              {(["x", "y", "z"] as const).map((axis) => <NumberField
                key={axis} label={`${field} ${axis.toUpperCase()}`}
                value={data[field][axis]} min={axis === "y" ? 0 : -50}
                max={axis === "y" ? 25 : 50}
                onChange={(value) => point(field, axis, value)} />)}
            </div>
          </div>)}
        </section>
        <section className={styles.panel}>
          <h2>Platforms / {data.platforms.length} of 50</h2>
          <p>Platforms use centre X/Z, width, depth, and top height.
            Each platform is 0.6 units thick. Landing is supported from above;
            side and ceiling collisions are not included in this prototype.</p>
          {data.platforms.map((item, index) => <article className={styles.card} key={item.id}>
            <h3>Platform {index + 1}</h3>
            <div className={styles.fields}>
              {(["x", "z", "w", "d", "top"] as const).map((field) => <NumberField
                key={field}
                label={field === "w" ? "Width" : field === "d" ? "Depth" : field === "top" ? "Top height" : field.toUpperCase()}
                value={item[field]}
                min={field === "w" || field === "d" ? 1 : field === "top" ? 0 : -50}
                max={field === "w" || field === "d" ? 40 : field === "top" ? 20 : 50}
                onChange={(value) => change({
                  ...data,
                  platforms: data.platforms.map((platform) =>
                    platform.id === item.id ? { ...platform, [field]: value } : platform),
                })} />)}
            </div>
            <button disabled={data.platforms.length <= 1} onClick={() => {
              if (window.confirm(`Remove platform ${index + 1}?`)) {
                change({ ...data, platforms: data.platforms.filter((platform) => platform.id !== item.id) });
              }
            }}>Remove platform</button>
          </article>)}
          <button disabled={data.platforms.length >= 50} onClick={() => change({
            ...data,
            platforms: [...data.platforms, {
              id: crypto.randomUUID(), x: 10, z: 5, w: 4, d: 4, top: 0,
            }],
          })}>Add platform</button>
        </section>
        <section className={styles.panel}>
          <h2>Collectibles / {data.collectibles.length} of 50</h2>
          <p>Gem coordinates describe their centre. Keep gems clear of platforms.
            Validation checks geometry, but does not guarantee every gem or jump is reachable.</p>
          {data.collectibles.map((item, index) => <article className={styles.card} key={item.id}>
            <h3>Gem {index + 1}</h3>
            <div className={styles.fields}>
              {(["x", "y", "z"] as const).map((axis) => <NumberField
                key={axis} label={axis.toUpperCase()} value={item[axis]}
                min={axis === "y" ? 0.3 : -50} max={axis === "y" ? 25 : 50}
                onChange={(value) => change({
                  ...data,
                  collectibles: data.collectibles.map((gem) =>
                    gem.id === item.id ? { ...gem, [axis]: value } : gem),
                })} />)}
            </div>
            <button disabled={data.collectibles.length <= 1} onClick={() => {
              if (window.confirm(`Remove gem ${index + 1}?`)) {
                change({ ...data, collectibles: data.collectibles.filter((gem) => gem.id !== item.id) });
              }
            }}>Remove gem</button>
          </article>)}
          <button disabled={data.collectibles.length >= 50} onClick={() => change({
            ...data,
            collectibles: [...data.collectibles, {
              id: crypto.randomUUID(),
              x: data.spawn.x, y: data.spawn.y + 0.8, z: data.spawn.z,
            }],
          })}>Add gem</button>
        </section>
      </fieldset>
    </>}
  </div></main>;
}

function NumberField({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number;
  onChange: (value: number) => void;
}) {
  return <label>{label}
    <input type="number" step="0.1" min={min} max={max}
      value={Number.isFinite(value) ? value : ""}
      onChange={(event) => onChange(event.target.valueAsNumber)} />
  </label>;
}
