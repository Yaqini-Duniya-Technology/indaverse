"use client";

import Link from "next/link";
import { GAME_GENRES } from "@/lib/production-tools.mjs";
import StudioWorkbench from "@/components/StudioWorkbench";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getProject } from "@/lib/projects";
import {
  getGame, saveGame, GAME_ASSET_KINDS, type GameData,
  type GameCharacter, type GameLevel, type GameAsset,
} from "@/lib/game";
import styles from "./game.module.css";
import GameImagePicker from "./GameImagePicker";
import GameHistory from "./GameHistory";
import BlueprintImport from "./BlueprintImport";
import GameDraftRecovery from "./GameDraftRecovery";
import GameTemplates from "./GameTemplates";
import GameSuggestions from "./GameSuggestions";
import { blueprintExport } from "@/lib/gameBlueprint";
import type { GameRevision } from "@/lib/game";

const empty: GameData = {
  title: "", dimension: "2d", genre: "", concept: "",
  core_loop: "", controls: "", characters: [], levels: [], assets: [],
};

function dataFrom(saved: GameData): GameData {
  return {
    title: saved.title, dimension: saved.dimension, genre: saved.genre,
    concept: saved.concept, core_loop: saved.core_loop, controls: saved.controls,
    characters: saved.characters, levels: saved.levels, assets: saved.assets,
  };
}

export default function GameStudioPage() {
  const params = useParams();
  return <GameEditor key={String(params.id)} projectId={Number(params.id)} />;
}

function GameEditor({ projectId }: { projectId: number }) {
  const [data, setData] = useState<GameData>(empty);
  const [baseline, setBaseline] = useState(JSON.stringify(empty));
  const [version, setVersion] = useState(0);
  const [savedDimension, setSavedDimension] =
    useState<GameData["dimension"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  const [autosaveEnabled, setAutosaveEnabled] = useState(false);
  const [autosaveBlocked, setAutosaveBlocked] = useState(false);
  const [autosaveMessage, setAutosaveMessage] = useState("Server autosave is off.");
  const dirty = ready && JSON.stringify(data) !== baseline;

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setReady(false);
      setError("");
      try {
        if (!Number.isSafeInteger(projectId) || projectId < 1) throw new Error("Invalid project ID.");
        const project = await getProject(projectId);
        if (project.project_type !== "game") throw new Error("Open Game Studio from a game project.");
        let next: GameData;
        let nextVersion = 0;
        try {
          const saved = await getGame(projectId);
          next = dataFrom(saved);
          nextVersion = saved.version;
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 404 ||
              err.message !== "No game blueprint saved yet.") throw err;
          next = { ...empty, title: project.name, concept: project.description || "" };
        }
        if (!active) return;
        setData(next);
        setBaseline(JSON.stringify(next));
        setVersion(nextVersion);
        setSavedDimension(nextVersion > 0 ? next.dimension : null);
        setAutosaveEnabled(false);
        setAutosaveBlocked(false);
        setAutosaveMessage("Latest blueprint loaded. Server autosave is off.");
        setReady(true);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load game blueprint.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [projectId, retry]);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirty && !saving) return;
      event.preventDefault();
      event.returnValue = "";
    }
    function guardNavigation(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 ||
          !(event.target instanceof Element)) return;
      const link = event.target.closest("a");
      if (!link || link.hasAttribute("download")) return;
      const target = new URL(link.href, window.location.href);
      if (target.origin === window.location.origin &&
          target.pathname === window.location.pathname &&
          target.search === window.location.search) return;
      if (saving || lock.current) {
        event.preventDefault();
        event.stopPropagation();
        setNotice("Wait for saving to finish before leaving.");
      } else if (dirty && !window.confirm("Leave without saving your game blueprint changes?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", guardNavigation, true);
    };
  }, [dirty, saving]);

  function change(values: Partial<GameData>) {
    if (lock.current) return;
    setData((current) => ({ ...current, ...values }));
    setNotice("");
  }

  function exportDraft() {
    const blob = new Blob([
      JSON.stringify(blueprintExport(projectId, data), null, 2),
    ], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `indaverse-game-${projectId}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Game blueprint draft exported.");
  }

  const save = useCallback(async (automatic = false) => {
    if (lock.current || !ready) return;
    if (!data.title.trim() ||
        data.characters.some((item) => !item.name.trim()) ||
        data.levels.some((item) => !item.title.trim()) ||
        data.assets.some((item) => !item.title.trim())) {
      setError("Give your game, characters, levels, and asset requirements a name.");
      if (automatic) {
        setAutosaveEnabled(false);
        setAutosaveMessage("Autosave stopped: complete the required names, then enable it again.");
      }
      return;
    }

    lock.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    if (automatic) setAutosaveMessage("Saving blueprint to server...");

    try {
      // Both manual and automatic saves use the same version-checked API.
      const saved = await saveGame(projectId, data, version);
      const next = dataFrom(saved);
      setData(next);
      setBaseline(JSON.stringify(next));
      setVersion(saved.version);
      setSavedDimension(next.dimension);
      setAutosaveBlocked(false);
      setNotice(`${automatic ? "Autosaved" : "Game blueprint saved"}. Version ${saved.version}.`);
      setAutosaveMessage(
        `${automatic ? "Autosaved" : "Saved"} to server at ${new Date().toLocaleTimeString()}.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save game blueprint.";
      setError(message);
      setAutosaveEnabled(false);

      if (err instanceof ApiError && err.status === 409) {
        setAutosaveBlocked(true);
        setAutosaveMessage(
          "Autosave stopped: another tab changed the saved blueprint. Export your draft, then load and review the latest version."
        );
      } else {
        setAutosaveMessage(
          "Autosave is off after a save error. Your draft remains in the editor. Check recovery status or export it before leaving."
        );
      }
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }, [data, projectId, ready, version]);

  useEffect(() => {
    if (!autosaveEnabled || autosaveBlocked || !ready || saving || !dirty || version < 1) return;

    const incomplete =
      !data.title.trim() ||
      data.characters.some((item) => !item.name.trim()) ||
      data.levels.some((item) => !item.title.trim()) ||
      data.assets.some((item) => !item.title.trim());

    if (incomplete) return;
    const timer = window.setTimeout(() => {
      if (document.hidden) {
        setAutosaveEnabled(false);
        setAutosaveMessage("Autosave paused while this tab was hidden. Enable it again when ready.");
        return;
      }
      void save(true);
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [autosaveEnabled, autosaveBlocked, ready, saving, dirty, version, data, save]);

  function applyImportedBlueprint(imported: GameData): boolean {
    if (lock.current || !ready) return false;
    if (dirty && !window.confirm(
      "Replace your unsaved blueprint with this import? Export your current draft first if you want to keep it."
    )) return false;

    // Keep this project's saved version and baseline for conflict-safe saving.
    setData(dataFrom(structuredClone(imported)));
    setError("");
    setNotice("Imported into your draft. Review the blueprint, then Save blueprint to store it.");
    return true;
  }

  function applySuggestions(candidate: GameData, source: string): boolean {
    if (lock.current || !ready) return false;
    if (JSON.stringify(data) !== source) {
      setError("Your draft changed after suggestions were prepared. Review missing sections again.");
      return false;
    }
    setAutosaveEnabled(false);
    setAutosaveMessage("Autosave is off while you review the applied suggestions.");
    setData(dataFrom(structuredClone(candidate)));
    setError("");
    setNotice("Selected starter suggestions applied to draft. Review them, then save manually.");
    return true;
  }

  function applyTemplate(template: GameData): boolean {
    if (lock.current || !ready) return false;
    if (!window.confirm(
      "Replace the entire blueprint draft with this template? Export your current draft first if you want to keep it. Existing playable layouts remain separate."
    )) return false;

    setAutosaveEnabled(false);
    setAutosaveMessage("Autosave is off while you review the applied template.");
    setData(dataFrom(structuredClone(template)));
    setError("");
    setNotice("Template applied to draft. Review it, then Save blueprint. No server save was made.");
    return true;
  }

  function restoreRevision(revision: GameRevision) {
    if (lock.current || !ready) return;
    if (dirty && !window.confirm("Replace your unsaved draft with this saved version? Export your draft first if you want to keep it.")) return;
    // Keep the current saved version and baseline for conflict-safe saving.
    setData(dataFrom(structuredClone(revision.snapshot)));
    setError("");
    setNotice(`Version ${revision.version} loaded into your draft. Review it, then save to store your changes.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reload() {
    if (lock.current) return;
    if (dirty && !window.confirm("Replace your unsaved draft? Export it first if you want to keep it.")) return;
    setNotice("");
    setRetry((value) => value + 1);
  }

  if (loading) return <main className={styles.page} aria-busy="true">Opening Game Studio...</main>;

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <nav className={styles.navigation} aria-label="Game Studio navigation">
          <Link href="/dashboard">IndaVerse</Link>
          <Link href={`/projects/${projectId}`}>Back to project</Link>
        </nav>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>GAME STUDIO / 2D &amp; 3D</p>
          <h1>Build the idea behind your next world.</h1>
          <p>Define gameplay, characters, levels, and the assets your game needs.</p>
        </header>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        {!ready ? <button className={styles.secondary} onClick={reload}>Retry loading</button> : (
          <>
            <StudioWorkbench kind="game" projectId={projectId} data={data} version={version} dirty={dirty} />
            <div className={styles.toolbar}>
              <span>{version ? `Saved version ${version}` : "New blueprint"} / {dirty ? "Unsaved changes" : "Draft up to date"}</span>
              <Link className={styles.secondary}
                href={`/projects/${projectId}/game/preview`}>Preview saved design</Link>
              {savedDimension && <Link className={styles.secondary}
                href={`/projects/${projectId}/game/play`}>
                {savedDimension === "3d" ? "Play 3D test" : "Play 2D level"}
              </Link>}
              {savedDimension === "2d" && <Link className={styles.secondary}
                href={`/projects/${projectId}/game/layout`}>Edit 2D playable layout</Link>}
              {savedDimension === "3d" && <Link className={styles.secondary}
                href={`/projects/${projectId}/game/scene`}>Edit 3D scene</Link>}
              {!savedDimension && <span>Save your first blueprint to open its player.</span>}
              <button className={styles.secondary} disabled={saving} onClick={exportDraft}>Export draft</button>
              <button className={styles.secondary} disabled={saving} onClick={reload}>Load latest</button>
              <button className={styles.primary} disabled={saving || (!dirty && version > 0)}
                onClick={() => void save()}>{saving ? "Saving..." : "Save blueprint"}</button>
            </div>
            <section className={styles.panel} aria-label="Server autosave">
              <h2>Server autosave</h2>
              <label>
                <input type="checkbox"
                  style={{ display: "inline-block", width: "auto", marginRight: 10 }}
                  checked={autosaveEnabled}
                  disabled={saving || version < 1 || autosaveBlocked}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setAutosaveEnabled(enabled);
                    setAutosaveMessage(enabled
                      ? "Autosave enabled. Changes save after 8 seconds without edits."
                      : "Server autosave is off.");
                  }} />
                Enable server autosave for this visit
              </label>
              {version < 1 && <p>Save your first blueprint manually before enabling autosave.</p>}
              <p role="status">{autosaveEnabled && !autosaveBlocked && ready && !saving && dirty && version > 0
                ? (!data.title.trim() || data.characters.some(item => !item.name.trim()) || data.levels.some(item => !item.title.trim()) || data.assets.some(item => !item.title.trim())
                  ? "Autosave is waiting for required game, character, level, and asset names."
                  : "Changes pending. Autosave will run after 8 seconds without edits.")
                : autosaveMessage}</p>
              <p>When enabled, edits, imported drafts, and restored drafts can save
                automatically. Each save checks the current version and records
                changed blueprints in history. Errors turn autosave off.
                Browser recovery remains separate.</p>
            </section>
            <GameTemplates key={`templates:${projectId}:${version}`}
              projectId={projectId} currentTitle={data.title}
              disabled={saving} onApply={applyTemplate} />
            <GameSuggestions key={`suggestions:${projectId}:${version}`}
              projectId={projectId} data={data} disabled={saving}
              onApply={applySuggestions} />
            <GameDraftRecovery projectId={projectId} data={data}
              version={version} dirty={dirty} disabled={saving}
              onApply={applyImportedBlueprint} />
            <BlueprintImport key={`import:${projectId}:${version}`}
              projectId={projectId} data={data} disabled={saving}
              onApply={applyImportedBlueprint} />
            <fieldset className={styles.editor} disabled={saving}>
              <section className={styles.panel}>
                <h2>Game direction</h2>
                <label>Game title<input maxLength={150} value={data.title}
                  onChange={(event) => change({ title: event.target.value })} /></label>
                <div className={styles.grid}>
                  <label>Choose 2D or 3D<select value={data.dimension} onChange={(event) =>
                    change({ dimension: event.target.value as GameData["dimension"] })}>
                    <option value="2d">2D game</option><option value="3d">3D game</option>
                  </select></label>
                  <label>Genre (choose or write your own)<input list="game-genre-options" maxLength={100} value={data.genre} placeholder="Adventure, puzzle, racing..."
                    onChange={(event) => change({ genre: event.target.value })} /></label>
                  <datalist id="game-genre-options">{GAME_GENRES.map(genre => <option key={genre} value={genre} />)}</datalist>
                </div>
                <div className={styles.panel}>
                  <h3>{data.dimension === "3d" ? "3D world design" : "2D game design"}</h3>
                  <p>{data.dimension === "3d" ? "Plan spatial worlds, character models and camera direction. The scene editor stores a separate playable prototype." : "Plan flat worlds, sprites and readable movement. The layout editor stores a separate playable prototype."}</p>
                  <p>Choose any genre for your design. Current browser tests support prototype movement and collection; racing, combat, RPG progression and other genre mechanics need further implementation.</p>
                  <p>Changing dimension keeps blueprint content. Save before opening the corresponding editor.</p>
                </div>
                <label>Game concept<textarea rows={4} maxLength={10000} value={data.concept}
                  onChange={(event) => change({ concept: event.target.value })} /></label>
                <label>Core gameplay loop<textarea rows={4} maxLength={10000} value={data.core_loop}
                  placeholder="What does the player do, earn, unlock, and repeat?"
                  onChange={(event) => change({ core_loop: event.target.value })} /></label>
                <label>Controls<textarea rows={3} maxLength={5000} value={data.controls}
                  placeholder="Movement, actions, keyboard, touch, or controller input..."
                  onChange={(event) => change({ controls: event.target.value })} /></label>
              </section>

              <ItemList<GameCharacter> title="Characters" singular="character"
                items={data.characters} limit={100} onChange={(characters) => change({ characters })}
                renderExtra={(item) => <GameImagePicker projectId={projectId}
                  imageId={item.image_id ?? null} label={`Image reference for ${item.name}`}
                  onChange={(image_id) => change({
                    characters: data.characters.map((entry) =>
                      entry.id === item.id ? { ...entry, image_id } : entry),
                  })} />}
                makeItem={() => ({ id: crypto.randomUUID(), name: "New character", role: "player", description: "" })}
                fields={[
                  { key: "name", label: "Character name", limit: 150 },
                  { key: "role", label: "Role", options: ["player", "ally", "enemy", "npc"] },
                  { key: "description", label: "Appearance, abilities, and behaviour", limit: 5000, multiline: true },
                ]} />

              <ItemList<GameLevel> title="Levels" singular="level"
                items={data.levels} limit={100} onChange={(levels) => change({ levels })}
                renderExtra={(item) => <GameImagePicker projectId={projectId}
                  imageId={item.image_id ?? null} label={`Image reference for ${item.title}`}
                  onChange={(image_id) => change({
                    levels: data.levels.map((entry) =>
                      entry.id === item.id ? { ...entry, image_id } : entry),
                  })} />}
                makeItem={() => ({ id: crypto.randomUUID(), title: "New level", setting: "", objective: "", challenges: "" })}
                fields={[
                  { key: "title", label: "Level title", limit: 150 },
                  { key: "setting", label: "Setting", limit: 5000, multiline: true },
                  { key: "objective", label: "Player objective and win condition", limit: 5000, multiline: true },
                  { key: "challenges", label: "Obstacles, enemies, and failure conditions", limit: 5000, multiline: true },
                ]} />

              <ItemList<GameAsset> title="Asset requirements" singular="asset requirement"
                items={data.assets} limit={200} onChange={(assets) => change({ assets })}
                makeItem={() => ({
                  id: crypto.randomUUID(), title: "New asset",
                  kind: data.dimension === "3d" ? "model" : "sprite", description: "",
                })}
                fields={[
                  { key: "title", label: "Asset name", limit: 150 },
                  { key: "kind", label: "Asset type", options: [...GAME_ASSET_KINDS] },
                  { key: "description", label: "Specifications and intended use", limit: 5000, multiline: true },
                ]} />
            </fieldset>
            <GameHistory key={`history:${projectId}:${version}`}
              projectId={projectId} savedVersion={version}
              disabled={saving} onRestore={restoreRevision} />
            <p className={styles.footnote}>
              Play opens the saved blueprint. Save dimension changes before testing them.
              The 2D player uses your saved 2D layout or its starter layout.
              The 3D player uses your saved 3D scene, or a starter scene when none is saved. Both use placeholder shapes.
              Written levels, asset requirements, and artwork are design references;
              they are not automatically converted into gameplay.
              Switching dimension preserves your blueprint requirements and separate 2D layout.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

interface ItemField<T> {
  key: keyof T;
  label: string;
  limit?: number;
  multiline?: boolean;
  options?: string[];
}

function ItemList<T extends { id: string }>({
  title, singular, items, limit, onChange, makeItem, fields, renderExtra,
}: {
  title: string;
  singular: string;
  items: T[];
  limit: number;
  onChange: (items: T[]) => void;
  makeItem: () => T;
  fields: ItemField<T>[];
  renderExtra?: (item: T) => import("react").ReactNode;
}) {
  function update(id: string, key: keyof T, value: string) {
    onChange(items.map((item) => item.id === id ? { ...item, [key]: value } : item));
  }
  function move(index: number, direction: number) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  return (
    <section className={styles.panel}>
      <div className={styles.heading}>
        <div><h2>{title}</h2><p>{items.length} of {limit}</p></div>
        <button className={styles.secondary} disabled={items.length >= limit}
          onClick={() => onChange([...items, makeItem()])}>+ Add {singular}</button>
      </div>
      {items.length === 0 && <p>No {title.toLowerCase()} added yet.</p>}
      {items.map((item, index) => (
        <article className={styles.card} key={item.id}>
          <div className={styles.heading}>
            <h3>{singular.charAt(0).toUpperCase() + singular.slice(1)} {index + 1}</h3>
            <div className={styles.actions}>
              <button aria-label={`Move ${singular} ${index + 1} up`}
                disabled={index === 0} onClick={() => move(index, -1)}>Move up</button>
              <button aria-label={`Move ${singular} ${index + 1} down`}
                disabled={index === items.length - 1} onClick={() => move(index, 1)}>Move down</button>
              <button onClick={() => {
                if (window.confirm(`Remove this ${singular} from your draft?`)) {
                  onChange(items.filter((entry) => entry.id !== item.id));
                }
              }}>Remove</button>
            </div>
          </div>
          {renderExtra?.(item)}
          {fields.map((field) => (
            <label key={String(field.key)}>{field.label}
              {field.options ? (
                <select value={String(item[field.key])}
                  onChange={(event) => update(item.id, field.key, event.target.value)}>
                  {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : field.multiline ? (
                <textarea rows={3} maxLength={field.limit} value={String(item[field.key])}
                  onChange={(event) => update(item.id, field.key, event.target.value)} />
              ) : (
                <input maxLength={field.limit} value={String(item[field.key])}
                  onChange={(event) => update(item.id, field.key, event.target.value)} />
              )}
            </label>
          ))}
        </article>
      ))}
    </section>
  );
}
