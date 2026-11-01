"use client";

import Link from "next/link";
import ProductionTools from "./ProductionTools";
import { useId, useMemo, useState } from "react";
import { analyzeStudio, type StudioKind } from "@/lib/studio-insights.mjs";
import styles from "./studioWorkbench.module.css";

export default function StudioWorkbench({ kind, projectId, data, version, savedLabel, dirty = false }: {
  kind: StudioKind; projectId: number; data: unknown; version: number; savedLabel?: string; dirty?: boolean;
}) {
  const id = useId();
  const analysis = useMemo(() => analyzeStudio(kind, data), [kind, data]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const entries = analysis.entries.filter(item => `${item.title} ${item.content}`.toLowerCase().includes(query.toLowerCase()));
  function download(content: string, extension: string, mime: string) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `indaverse-${kind}-${projectId}-working-copy.${extension}`;
    anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Working copy downloaded. This does not save it to the server.");
  }
  return <section className={styles.panel} aria-labelledby={`${id}-heading`}>
    <nav className={styles.navigation} aria-label={`${kind} workspace links`}>
      <Link href="/dashboard">Dashboard</Link><Link href={`/projects/${projectId}`}>Project workspace</Link>
      <Link href={`/projects/${projectId}#project-images`}>Project images</Link>
    </nav>
    <div className={styles.heading}><div><p className={styles.eyebrow}>WORKING COPY / {kind.toUpperCase()}</p>
      <h2 id={`${id}-heading`}>Draft desk</h2></div>
      <span>{savedLabel ?? (version > 0 ? `Based on saved version ${version}` : "Not saved yet")}{dirty ? " / Unsaved edits" : ""}</span>
    </div>
    <dl className={styles.metrics}>{analysis.metrics.map(metric => <div key={metric.label}>
      <dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}</dl>
    <ProductionTools kind={kind} projectId={projectId} data={data} />
    <details className={styles.details}><summary>Review draft ({analysis.issues.length} notes)</summary>
      <p>Advisory checks only. They do not block saves or certify a finished product.</p>
      {analysis.issues.length ? <ul>{analysis.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
        : <p>No issues found by these basic checks.</p>}
    </details>
    <details className={styles.details}><summary>Browse working copy</summary>
      <label htmlFor={`${id}-query`}>Search sections, chapters, shots or pages</label>
      <input id={`${id}-query`} type="search" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} />
      <p>{entries.length} matching entries in this draft.</p>
      <div className={styles.entries}>{entries.map((item, index) => <article key={index}>
        <h3>{item.title}</h3><small>{item.detail}</small><p>{item.content || "No content yet."}</p></article>)}</div>
    </details>
    <div className={styles.actions}>
      <button type="button" onClick={() => download(analysis.report, "md", "text/markdown;charset=utf-8")}>Download working notes</button>
      <button type="button" onClick={() => download(analysis.csv, "csv", "text/csv;charset=utf-8")}>Download planning CSV</button>
      <button type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(analysis.report); setNotice("Working notes copied."); }
        catch { setNotice("Clipboard unavailable. Use Download working notes instead."); }
      }}>Copy working notes</button>
    </div>
    <p className={styles.hint}>Exports contain the current editor data, including unsaved edits. Media files, separate scenes and revision history are excluded. These notes and CSVs are not blueprint import files.</p>
    <p role="status" aria-live="polite">{notice}</p>
  </section>;
}
