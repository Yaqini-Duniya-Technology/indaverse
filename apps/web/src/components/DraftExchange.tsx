"use client";
import { useEffect, useId, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { draftExport, parseRecovery, recoveryPrefix, recoveryRecord,
  type RecoveryContext, type RecoveryRecord, type RecoveryStudio } from "@/lib/draft-recovery.mjs";
import styles from "./studioWorkbench.module.css";

type Validation<T> = { valid: boolean; data: T | null; issues: { field: string; message: string }[]; warnings: string[] };
type Context = RecoveryContext & { prefix: string; key: string };
type Copy = { key: string; record: RecoveryRecord };
type Review<T> = { result: Validation<T>; source: string; fingerprint: string; baseVersion?: number };
function copiesFor(context: Context): Copy[] {
  const copies: Copy[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key || key === context.key || !key.startsWith(context.prefix)) continue;
    const record = parseRecovery(localStorage.getItem(key), context);
    if (record) copies.push({ key, record });
  }
  return copies.sort((a, b) => Date.parse(b.record.saved_at) - Date.parse(a.record.saved_at));
}
export default function DraftExchange<T>({ studio, projectId, data, version, dirty, disabled, onApply }: {
  studio: RecoveryStudio; projectId: number; data: T; version: number; dirty: boolean; disabled: boolean;
  onApply: (data: T) => boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const active = useRef(false);
  const latest = useRef({ data, version, dirty });
  const [context, setContext] = useState<Context | null>(null);
  const [copies, setCopies] = useState<Copy[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("Browser recovery is off. Manual exports are available.");
  const [error, setError] = useState("");
  const [review, setReview] = useState<Review<T> | null>(null);
  useEffect(() => { latest.current = { data, version, dirty }; }, [data, version, dirty]);
  useEffect(() => {
    active.current = true;
    let current = true;
    void getCurrentUser().then(user => {
      if (!current) return;
      const prefix = recoveryPrefix(user.id, projectId, studio);
      const next = { userId: user.id, projectId, studio, prefix, key: prefix + crypto.randomUUID() };
      try {
        localStorage.setItem(next.key + ':probe', '1'); localStorage.removeItem(next.key + ':probe');
        setCopies(copiesFor(next)); setContext(next);
      } catch { setError("Browser storage is unavailable. Download a draft to preserve your work."); }
    }).catch(() => { if (current) setError("Sign in to access account-scoped browser recovery. Manual export remains available."); });
    return () => { current = false; active.current = false; };
  }, [studio, projectId]);
  function persist(context: Context) {
    try {
      const snapshot = latest.current;
      if (!snapshot.dirty) {
        localStorage.removeItem(context.key);
        return "Draft matches the saved server version.";
      }
      const record = recoveryRecord(context, snapshot);
      const encoded = JSON.stringify(record);
      if (new Blob([encoded]).size > 2 * 1024 * 1024) throw new Error("Recovery copy exceeds 2 MB.");
      localStorage.setItem(context.key, encoded);
      return `Browser recovery updated at ${new Date(record.saved_at).toLocaleTimeString()}.`;
    } catch { return "Browser recovery could not write. Storage may be full or blocked. Export your draft."; }
  }
  useEffect(() => {
    if (!context || !enabled) return;
    const timer = window.setTimeout(() => { setMessage(persist(context)); }, 900);
    return () => window.clearTimeout(timer);
  }, [context, enabled, data, version, dirty]);
  useEffect(() => {
    if (!context || !enabled) return;
    function flush() { persist(context!); }
    function hidden() { if (document.hidden) flush(); }
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [context, enabled]);
  useEffect(() => {
    if (!context) return;
    function storage(event: StorageEvent) {
      if (event.key === null || event.key.startsWith(context!.prefix)) {
        try { setCopies(copiesFor(context!)); } catch { setError("Unable to refresh local recovery copies."); }
      }
    }
    window.addEventListener("storage", storage);
    return () => window.removeEventListener("storage", storage);
  }, [context]);
  function download(value: unknown, suffix: string) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(draftExport(studio, projectId, value), null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `indaverse-${studio}-${projectId}-${suffix}.json`;
    link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("JSON draft exported. Server data and saved version are unchanged.");
  }
  async function validate(document: unknown, source: string, baseVersion?: number, held = false) {
    if ((lock.current && !held) || disabled) return;
    lock.current = true; setPending(true); setError(""); setReview(null);
    const fingerprint = JSON.stringify(latest.current.data);
    try {
      const result = await apiFetch<Validation<T>>(`/api/v1/projects/${projectId}/${studio}/validate-import`, { method: "POST", body: document });
      if (active.current) setReview({ result, source, fingerprint, baseVersion });
    } catch (caught) { if (active.current) setError(caught instanceof Error ? caught.message : "Validation failed."); }
    finally { lock.current = false; if (active.current) setPending(false); }
  }
  async function choose(file?: File) {
    if (!file || lock.current || disabled) return;
    if (file.size > 2 * 1024 * 1024) { setError("Choose a JSON draft no larger than 2 MB."); return; }
    lock.current = true; setPending(true); setError(""); setReview(null);
    try {
      const document: unknown = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
      await validate(document, file.name, undefined, true);
    } catch { setError("This file is not valid JSON. Choose an IndaVerse draft export."); }
    finally { lock.current = false; if (active.current) setPending(false); if (input.current) input.current.value = ""; }
  }
  return <section className={styles.panel} aria-labelledby={`${id}-heading`} aria-busy={pending}>
    <h2 id={`${id}-heading`} className="text-xl font-semibold">Draft safety and transfer</h2>
    <p className={styles.hint}>Import a matching studio JSON draft. Validation does not save it. Applying replaces this editor’s working copy; save manually when ready. Media files and separate resources are excluded.</p>
    <div className={styles.actions}>
      <button type="button" disabled={disabled || pending} onClick={() => download(data, "draft-v1")}>Export portable JSON</button>
      <button type="button" disabled={disabled || pending} onClick={() => input.current?.click()}>Choose JSON to review</button>
    </div>
    <input hidden ref={input} type="file" accept=".json,application/json" disabled={disabled || pending} onChange={event => void choose(event.target.files?.[0])} />
    <label className="my-4 block"><input type="checkbox" checked={enabled} disabled={!context || disabled} onChange={event => {
      setEnabled(event.target.checked); setMessage(event.target.checked ? "Browser recovery enabled for this visit." : "Browser recovery is off. Existing copies are kept.");
    }} /> Enable browser recovery for this visit</label>
    <p className={styles.hint}>Local copies are scoped to this account, project, studio and editor tab. They are stored unencrypted in this browser. Avoid shared devices; clearing browser storage removes them. Recovery is separate from server autosave.</p>
    <p role="status">{message}</p>{error && <p role="alert" className="my-3 text-red-300">{error}</p>}
    <button type="button" className="my-3 rounded-lg border border-zinc-600 px-3 py-2" disabled={!context || disabled || pending} onClick={() => {
      try { if (context) setCopies(copiesFor(context)); } catch { setError("Unable to read browser recovery copies."); }
    }}>Refresh recovery copies</button>
    <p>{copies.length} other recovery copies for this account and project. Showing newest 10.</p>
    {copies.slice(0, 10).map(copy => <article className="my-3 rounded-xl border border-zinc-600 p-4" key={copy.key}>
      <h3>Copy from {new Date(copy.record.saved_at).toLocaleString()}</h3>
      <p>Based on saved version {copy.record.base_version}. Current version: {version}.</p>
      {copy.record.base_version !== version && <p className="text-amber-200">Versions differ. Restoring keeps the current server-save version; compare before applying.</p>}
      <div className={styles.actions}>
        <button type="button" disabled={disabled || pending} onClick={() => void validate(draftExport(studio, projectId, copy.record.data), "Browser recovery", copy.record.base_version)}>Review recovery</button>
        <button type="button" disabled={disabled || pending} onClick={() => download(copy.record.data, "recovery")}>Export copy</button>
        <button type="button" disabled={disabled || pending} onClick={() => {
          if (!context || !window.confirm("Delete only this browser copy? Your current draft and server save are unchanged.")) return;
          try { localStorage.removeItem(copy.key); setCopies(copiesFor(context)); } catch { setError("Could not delete the selected copy."); }
        }}>Delete this copy</button>
      </div>
    </article>)}
    {review && <div className="my-4 rounded-xl border border-violet-400 p-4">
      <h3 className="font-semibold">Review: {review.source}</h3>
      {review.result.issues.map((issue, index) => <p key={index} role="alert">{issue.field}: {issue.message}</p>)}
      {review.result.warnings.map((warning, index) => <p key={index}>{warning}</p>)}
      {review.fingerprint !== JSON.stringify(data) && <p className="text-amber-200">You edited the draft after this preview began. Applying will replace those newer edits too.</p>}
      {review.baseVersion !== undefined && review.baseVersion !== version && <p className="text-amber-200">Recovery version differs from the latest loaded version.</p>}
      <details><summary className="cursor-pointer">Inspect validated data</summary><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(review.result.data, null, 2)}</pre></details>
      <div className={styles.actions}>
        <button type="button" disabled={disabled || pending || !review.result.valid || !review.result.data} onClick={() => {
          if (!review.result.valid || !review.result.data || !window.confirm("Replace the current editor draft with this reviewed copy? This does not save to the server.")) return;
          if (onApply(review.result.data)) { setReview(null); setMessage("Draft applied. Review it and save manually. Its destination version was retained."); }
        }}>Apply reviewed draft</button>
        <button type="button" onClick={() => setReview(null)}>Dismiss preview</button>
      </div>
    </div>}
  </section>;
}
