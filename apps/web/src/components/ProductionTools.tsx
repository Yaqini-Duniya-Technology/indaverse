"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { chapterPlan, musicTiming, productionRows, repeatedLines, routeAudit } from "@/lib/production-tools.mjs";
import { GAME_ASSET_KINDS } from "@/lib/game";
import { csv, type StudioKind } from "@/lib/studio-insights.mjs";
import styles from "./studioWorkbench.module.css";
type Draft = { assets?: {kind: string}[]; bpm?: number; chapters?: {title: string; content: string}[]; shots?: {duration_seconds: number}[]; aspect_ratio?: string; pages?: {path: string; name: string; sections?: {kind: string}[]}[]; characters?: {name: string; role: string}[]; levels?: {title: string; objective: string}[]; dimension?: string };
export default function ProductionTools({ kind, data, projectId }: {kind: StudioKind; data: unknown; projectId: number}) {
  const draft = (data && typeof data === "object" ? data : {}) as Draft;
  const id = useId();
  const [filter, setFilter] = useState("");
  const [tempo, setTempo] = useState(90);
  const [bars, setBars] = useState(32);
  const [beats, setBeats] = useState(4);
  const [speed, setSpeed] = useState(200);
  const [target, setTarget] = useState(1000);
  const [emptyOnly, setEmptyOnly] = useState(false);
  const [budget, setBudget] = useState(60);
  const [minimum, setMinimum] = useState(0);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const rows = productionRows(kind, data, {filter, speed, target, emptyOnly, minimum});
  const timing = musicTiming(tempo, bars, beats);
  const chapters = chapterPlan(draft.chapters, speed, target);
  const duration = (draft.shots ?? []).reduce((sum, shot) => sum + shot.duration_seconds, 0);
  function exportReport() {
    const content = csv([['Entry','Planning detail','Notes'], ...rows.map(row => [row.title,row.detail,row.content])]);
    const url = URL.createObjectURL(new Blob([content], {type: 'text/csv;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = `indaverse-${kind}-${projectId}-production.csv`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice("Filtered production report exported. Draft and server data are unchanged.");
  }
  return <details className={styles.details}><summary>Production tools and options</summary>
    <p>Planning tools use the current working draft. Settings are temporary and never change or save your draft. <Link href="/help">Examples in Help Centre</Link>.</p>
    {kind === 'music' && <div>
      <h3>Tempo and arrangement calculator</h3><label htmlFor={`${id}-tempo`}>Planning tempo (BPM, 1–300)</label><input id={`${id}-tempo`} type="number" min={1} max={300} value={tempo} onChange={event => setTempo(Number(event.target.value))} />
      <button type="button" disabled={!draft.bpm} onClick={() => setTempo(draft.bpm ?? 90)}>Use draft BPM</button>
      <label>Bars (1–1000)<input type="number" min={1} max={1000} value={bars} onChange={event => setBars(Number(event.target.value))} /></label>
      <label>Beats per bar<select value={beats} onChange={event => setBeats(Number(event.target.value))}>{[2,3,4,6].map(value => <option key={value}>{value}</option>)}</select></label>
      <p>{timing ? `${timing.seconds.toFixed(1)} seconds; ${timing.beatSeconds.toFixed(3)} seconds per beat. Arrangement estimate only.` : 'Enter values within the displayed ranges.'}</p>
      <label>Lyric cue section<select value={filter} onChange={event => setFilter(event.target.value)}><option value="">All sections</option>{['intro','verse 1','chorus','verse 2','bridge','outro'].map(value => <option key={value}>{value}</option>)}</select></label>
      <h3>Repeated lyric lines</h3><p>Repeated lines can be intentional hooks. Matching ignores letter case.</p>{repeatedLines(data).length ? repeatedLines(data).map(row => <p key={row.line}>{row.count}× {row.line}</p>) : <p>No repeated non-empty lines.</p>}
    </div>}
    {kind === 'story' && <div><h3>Chapter pacing</h3>
      <label>Reading speed (50–1000 words/min)<input type="number" min={50} max={1000} value={speed} onChange={event => setSpeed(Number(event.target.value))} /></label>
      <label>Target words per chapter<input type="number" min={1} max={100000} value={target} onChange={event => setTarget(Number(event.target.value))} /></label>
      <p>Estimated manuscript reading time: {chapters.reduce((sum, row) => sum + row.minutes, 0).toFixed(1)} minutes. Reading speed varies.</p>
      <label><input type="checkbox" checked={emptyOnly} onChange={event => setEmptyOnly(event.target.checked)} /> Show unwritten chapters only</label>
    </div>}
    {kind === 'video' && <div><h3>Runtime and shot schedule</h3>
      <label>Target runtime in seconds<input type="number" min={1} max={86400} value={budget} onChange={event => setBudget(Number(event.target.value))} /></label>
      <p>{duration} seconds planned. {budget > 0 ? `${Math.abs(duration-budget)} seconds ${duration > budget ? 'over' : 'under'} target.` : 'Enter a positive target.'} This does not render video.</p>
      <label>Minimum shot duration<select value={minimum} onChange={event => setMinimum(Number(event.target.value))}>{[0,5,10,30,60].map(value => <option key={value} value={value}>{value ? `${value}+ seconds` : 'All shots'}</option>)}</select></label>
      <p>Saved draft aspect choice: {draft.aspect_ratio ?? '16:9'}</p><div aria-label="Aspect ratio planning frame" style={{aspectRatio: draft.aspect_ratio === '9:16' ? '9/16' : draft.aspect_ratio === '1:1' ? '1' : '16/9', maxWidth: 240, border: '2px dashed #bcd4ff', display: 'grid', placeItems: 'center', padding: 12}}>Storyboard frame</div>
    </div>}
    {kind === 'software' && <div><h3>Routes and feature scope</h3>
      <label>Feature priority<select value={filter} onChange={event => setFilter(event.target.value)}><option value="">All priorities</option><option value="must_have">Must have</option><option value="should_have">Should have</option><option value="later">Later</option></select></label>
      <h4>Sitemap and route audit</h4>{routeAudit(draft.pages).map((row,index) => <p key={index}>{row.path} — {row.name}; {row.sections} sections{row.duplicate ? ' — duplicate route' : ''}</p>)}
      {!draft.pages?.some(page => page.path === '/') && <p>Add a home route / in the page editor if this product needs one.</p>}
      <h4>Section inventory</h4>{['hero','text','cards','form','call_to_action'].map(kind => <p key={kind}>{kind.replaceAll('_',' ')}: {(draft.pages ?? []).flatMap(page => page.sections ?? []).filter(section => section.kind === kind).length}</p>)}
      <details><summary>Acceptance checklist from current feature scope</summary>{rows.map((row,index) => <label key={index} style={{display:'block'}}><input type="checkbox" /> Manually verify: {row.title}</label>)}<p>Checks are temporary. Test the implemented app separately.</p></details>
    </div>}
    {kind === 'game' && <div><h3>Game production inventory</h3>
      <label>Asset category<select value={filter} onChange={event => setFilter(event.target.value)}><option value="">All categories</option>{GAME_ASSET_KINDS.map(value => <option key={value}>{value}</option>)}</select></label>
      <details><summary>Asset requirements by category</summary>{GAME_ASSET_KINDS.map(category => <p key={category}>{category}: {(draft.assets ?? []).filter(asset => asset.kind === category).length}</p>)}</details>
      <label>Find a level objective<input type="search" maxLength={150} value={query} onChange={event => setQuery(event.target.value)} /></label>
      {(draft.levels ?? []).filter(level => `${level.title} ${level.objective}`.toLowerCase().includes(query.toLowerCase())).map((level,index) => <p key={index}><strong>{level.title}</strong>: {level.objective || 'No objective yet.'}</p>)}
      <details><summary>Character role roster</summary>{(draft.characters ?? []).map((character,index) => <p key={index}>{character.name}: {character.role || 'Role not specified'}</p>)}</details>
      <p>{draft.dimension === '3d' ? '3D: save the blueprint, prepare a supported scene with spawn and exit on platforms, then test browser playback.' : '2D: save the blueprint, edit the separate playable layout, then test movement and collectibles.'} Genre describes design intent; it does not install genre-specific mechanics.</p>
    </div>}
    <h3>Production entries ({rows.length})</h3><div className={styles.entries}>{rows.map((row,index) => <article key={index}><h4>{row.title}</h4><p>{row.detail}</p>{row.content && <p style={{whiteSpace:'pre-wrap'}}>{row.content}</p>}</article>)}</div>
    <button type="button" onClick={exportReport}>Download filtered production CSV</button><p role="status">{notice}</p>
  </details>;
}
