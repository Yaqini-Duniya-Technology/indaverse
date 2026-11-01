"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { guideFor } from "@/lib/workspace-guides.mjs";
import styles from "./workspaceHelp.module.css";
function subscribeHash(listener: () => void) {
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => { window.removeEventListener("hashchange", listener); window.removeEventListener("popstate", listener); };
}
export default function WorkspaceHelp() {
  const path = usePathname();
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const guide = guideFor(path, hash);
  return <HelpContent key={guide.id} guide={guide} />;
}
function HelpContent({ guide }: { guide: ReturnType<typeof guideFor> }) {
  const id = useId();
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const [search, setSearch] = useState("");
  const fields = guide.fields.filter(field => `${field.name} ${field.meaning} ${field.example}`.toLowerCase().includes(search.toLowerCase()));
  return <aside className={styles.dock} aria-label="Workspace help">
    <details ref={details} onKeyDown={event => {
      if (event.key === "Escape" && details.current?.open) { details.current.open = false; summary.current?.focus(); }
    }}>
      <summary ref={summary}>Help with this page</summary>
      <div className={styles.panel}>
        <div className={styles.heading}><h2>{guide.title}</h2><button type="button" onClick={() => {
          if (details.current) details.current.open = false; summary.current?.focus();
        }} aria-label="Close workspace help">Close</button></div>
        <p>{guide.intro}</p><Link href="/help">Open categorized Help Centre →</Link>
        <label htmlFor={`${id}-search`}>Find a field or action</label>
        <input type="search" id={`${id}-search`} maxLength={150} value={search} onChange={event => setSearch(event.target.value)} />
        <p role="status">{fields.length} help topics</p>
        {fields.map(field => <section key={field.name}><h3>{field.name}</h3><p>{field.meaning}</p><p className={styles.example}><strong>Example:</strong> {field.example}</p></section>)}
        <p>Examples are guidance only. Opening help does not fill, save, generate or change your project.</p>
        <a href="https://yd.ydtech.workers.dev" target="_blank" rel="noopener noreferrer">Built by Yaqini &amp; Duniya Technology ↗</a>
      </div>
    </details>
  </aside>;
}
