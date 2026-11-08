"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import {
  defaultLayout, sprintLayout, getPlaySettings, savePlaySettings, type PlayLayout,
} from "@/lib/gamePlay";
import { getGame } from "@/lib/game";
import styles from "../game.module.css";
import LayoutCanvas from "./LayoutCanvas";

export default function LayoutPage() {
  const params = useParams();
  return <Editor key={String(params.id)} projectId={Number(params.id)} />;
}

function Editor({ projectId }: { projectId: number }) {
  const [layout, setLayout] = useState<PlayLayout>(defaultLayout);
  const [baseline, setBaseline] = useState("");
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  const history = useRef<{ past: PlayLayout[]; future: PlayLayout[] }>({
    past: [], future: [],
  });
  const currentLayout = useRef(layout);
  const gesture = useRef<PlayLayout | null>(null);
  const [historyCounts, setHistoryCounts] = useState({ past: 0, future: 0 });

  function syncHistory() {
    setHistoryCounts({
      past: history.current.past.length,
      future: history.current.future.length,
    });
  }

  function resetHistory(next: PlayLayout) {
    currentLayout.current = next;
    gesture.current = null;
    history.current = { past: [], future: [] };
    syncHistory();
  }

  function beginGesture() {
    if (!lock.current) gesture.current = currentLayout.current;
  }

  function endGesture() {
    const before = gesture.current;
    gesture.current = null;
    if (!before || JSON.stringify(before) === JSON.stringify(currentLayout.current)) return;
    history.current.past = [...history.current.past, before].slice(-100);
    history.current.future = [];
    syncHistory();
  }

  function travel(direction: "undo" | "redo") {
    if (lock.current || gesture.current) return;
    const source = direction === "undo" ? history.current.past : history.current.future;
    const next = source.pop();
    if (!next) return;
    const destination = direction === "undo" ? history.current.future : history.current.past;
    destination.push(currentLayout.current);
    if (destination.length > 100) destination.shift();
    currentLayout.current = next;
    setLayout(next);
    setError("");
    setNotice(direction === "undo" ? "Edit undone. Save to keep this layout." : "Edit restored. Save to keep this layout.");
    syncHistory();
  }
  const dirty = ready && JSON.stringify(layout) !== baseline;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setReady(false);
    setError("");
    void (async () => {
      try {
        if (!Number.isSafeInteger(projectId) || projectId < 1) throw new Error("Invalid project ID.");
        const game = await getGame(projectId);
        if (game.dimension !== "2d") throw new Error("Playable layouts currently support saved 2D designs only.");
        let next = defaultLayout();
        let nextVersion = 0;
        try {
          const saved = await getPlaySettings(projectId);
          next = saved.layout;
          nextVersion = saved.version;
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 404 ||
              err.message !== "No playable level settings saved yet.") throw err;
        }
        if (!active) return;
        resetHistory(next);
        setLayout(next);
        setBaseline(JSON.stringify(next));
        setVersion(nextVersion);
        setReady(true);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load layout.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [projectId, retry]);

  useEffect(() => {
    function unload(event: BeforeUnloadEvent) {
      if (!dirty && !saving) return;
      event.preventDefault();
      event.returnValue = "";
    }
    function navigate(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || !(event.target instanceof Element)) return;
      const link = event.target.closest("a");
      if (!link || link.hasAttribute("download")) return;
      const target = new URL(link.href, location.href);
      if (target.origin === location.origin && target.pathname === location.pathname &&
          target.search === location.search) return;
      if (lock.current || (dirty && !window.confirm("Leave without saving layout changes?"))) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty, saving]);

  function change(next: PlayLayout) {
    if (lock.current || JSON.stringify(next) === JSON.stringify(currentLayout.current)) return;
    if (!gesture.current) {
      history.current.past = [...history.current.past, currentLayout.current].slice(-100);
      history.current.future = [];
      syncHistory();
    }
    currentLayout.current = next;
    setLayout(next);
    setNotice("");
  }

  async function save() {
    if (!ready || lock.current) return;
    lock.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await savePlaySettings(projectId, layout, version);
      currentLayout.current = saved.layout;
      setLayout(saved.layout);
      setBaseline(JSON.stringify(saved.layout));
      setVersion(saved.version);
      setNotice(`Playable layout saved. Version ${saved.version}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Layout save failed.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  function exportDraft() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({
      project_id: projectId, expected_version: version, layout,
    }, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `indaverse-layout-${projectId}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <main className={styles.page}><div className={styles.container}>
    <nav className={styles.navigation}>
      <Link href={`/projects/${projectId}/game`}>Back to Game Studio</Link>
      <Link href={`/projects/${projectId}/game/play`}>Open playable game</Link>
    </nav>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>PLAYABLE LEVEL LAYOUT</p>
      <h1>Shape the space your player explores.</h1>
      <p>800 by 400 pixels. X increases to the right; Y increases downward.
        Platforms support landing from above. Test every collectible for reachability.</p>
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {loading ? <p aria-busy="true">Loading layout...</p> : !ready ? (
      <button className={styles.secondary} onClick={() => setRetry((value) => value + 1)}>Retry</button>
    ) : <>
      <div className={styles.toolbar}>
        <span>{version ? `Saved version ${version}` : "Unsaved starter layout"} / {dirty ? "Changes pending" : "Draft up to date"}</span>
        <button className={styles.secondary}
          disabled={saving || historyCounts.past === 0}
          onClick={() => travel("undo")}>Undo</button>
        <button className={styles.secondary}
          disabled={saving || historyCounts.future === 0}
          onClick={() => travel("redo")}>Redo</button>
        <button className={styles.secondary} disabled={saving} onClick={exportDraft}>Export draft</button>
        <button className={styles.secondary} disabled={saving} onClick={() => {
          if (!dirty || window.confirm("Replace unsaved changes with the latest saved layout?")) {
            setNotice(""); setRetry((value) => value + 1);
          }
        }}>Load latest</button>
        <button className={styles.primary} disabled={saving || (!dirty && version > 0)}
          onClick={() => void save()}>{saving ? "Saving..." : "Save layout"}</button>
      </div>
      <fieldset className={styles.panel} disabled={saving}>
        <legend>2D layout templates</legend>
        <button className={styles.secondary} type="button" onClick={() => {
          if (!dirty || window.confirm("Replace unsaved layout edits with this template?")) change(defaultLayout());
        }}>Use Platform steps</button>{" "}
        <button className={styles.secondary} type="button" onClick={() => {
          if (!dirty || window.confirm("Replace unsaved layout edits with this template?")) change(sprintLayout());
        }}>Use Ground sprint</button>
      </fieldset>
      <LayoutCanvas layout={layout} disabled={saving} onChange={change}
        onGestureStart={beginGesture} onGestureEnd={endGesture} />
      <fieldset className={styles.editor} disabled={saving}>
        <section className={styles.panel}>
          <h2>Spawn and exit</h2>
          <p>Player size: 24 by 34. Exit size: 36 by 50.</p>
          <div className={styles.grid}>
            <NumberField label="Spawn X" value={layout.spawn.x} min={0} max={776}
              onChange={(x) => change({ ...layout, spawn: { ...layout.spawn, x } })} />
            <NumberField label="Spawn Y" value={layout.spawn.y} min={0} max={366}
              onChange={(y) => change({ ...layout, spawn: { ...layout.spawn, y } })} />
            <NumberField label="Exit X" value={layout.exit.x} min={0} max={764}
              onChange={(x) => change({ ...layout, exit: { ...layout.exit, x } })} />
            <NumberField label="Exit Y" value={layout.exit.y} min={0} max={350}
              onChange={(y) => change({ ...layout, exit: { ...layout.exit, y } })} />
          </div>
        </section>
        <section className={styles.panel}>
          <h2>Platforms ({layout.platforms.length}/50)</h2>
          <button className={styles.secondary} disabled={layout.platforms.length >= 50} onClick={() =>
            change({ ...layout, platforms: [...layout.platforms, {
              id: crypto.randomUUID(), x: 100, y: 200, w: 100, h: 16,
            }] })}>Add platform</button>
          {layout.platforms.map((item, index) => <article className={styles.card} key={item.id}>
            <h3>Platform {index + 1}</h3>
            <div className={styles.grid}>
              {(["x", "y", "w", "h"] as const).map((field) =>
                <NumberField key={field} label={field.toUpperCase()} value={item[field]}
                  min={field === "w" ? 24 : field === "h" ? 5 : 0}
                  max={field === "x" ? 799 : field === "y" ? 399 : field === "w" ? 800 : 100}
                  onChange={(value) => change({ ...layout, platforms: layout.platforms.map((entry) =>
                    entry.id === item.id ? { ...entry, [field]: value } : entry) })} />)}
            </div>
            <button className={styles.secondary} disabled={layout.platforms.length <= 1}
              onClick={() => {
                if (window.confirm("Remove this platform?")) change({
                  ...layout, platforms: layout.platforms.filter((entry) => entry.id !== item.id),
                });
              }}>Remove platform</button>
          </article>)}
        </section>
        <section className={styles.panel}>
          <h2>Collectibles ({layout.collectibles.length}/50)</h2>
          <button className={styles.secondary} disabled={layout.collectibles.length >= 50} onClick={() =>
            change({ ...layout, collectibles: [...layout.collectibles, {
              id: crypto.randomUUID(), x: 100, y: 340,
            }] })}>Add collectible</button>
          {layout.collectibles.map((item, index) => <article className={styles.card} key={item.id}>
            <h3>Collectible {index + 1}</h3>
            <div className={styles.grid}>
              <NumberField label="X" value={item.x} min={10} max={790} onChange={(x) =>
                change({ ...layout, collectibles: layout.collectibles.map((entry) =>
                  entry.id === item.id ? { ...entry, x } : entry) })} />
              <NumberField label="Y" value={item.y} min={10} max={390} onChange={(y) =>
                change({ ...layout, collectibles: layout.collectibles.map((entry) =>
                  entry.id === item.id ? { ...entry, y } : entry) })} />
            </div>
            <button className={styles.secondary} disabled={layout.collectibles.length <= 1} onClick={() => {
              if (window.confirm("Remove this collectible?")) change({
                ...layout, collectibles: layout.collectibles.filter((entry) => entry.id !== item.id),
              });
            }}>Remove collectible</button>
          </article>)}
        </section>
      </fieldset>
    </>}
  </div></main>;
}

function NumberField({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number;
  onChange: (value: number) => void;
}) {
  return <label>{label}<input type="number" value={value} min={min} max={max} step={1}
    onChange={(event) => {
      const number = event.target.valueAsNumber;
      if (Number.isSafeInteger(number)) onChange(number);
    }} /></label>;
}
