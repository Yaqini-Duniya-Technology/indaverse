"use client";

import { useEffect, useRef, useState } from "react";
import { encodeSequenceRecovery, parseSequenceRecovery, recoveryIssue, sequenceRecoveryPrefix,
  type SequenceDraft, type SequenceRecoveryCopy } from "@/lib/sequence-recovery.mjs";

type Entry = { key: string; raw: string; copy: SequenceRecoveryCopy };
type Saved = Parameters<typeof recoveryIssue>[1];

export default function SequenceDraftRecovery({userId, projectId, saved, draft, dirty, busy, saveReceipt, onRestore, control}: {
  userId: number; projectId: number; saved: Saved; draft: SequenceDraft; dirty: boolean; busy: boolean;
  saveReceipt: number; onRestore: (copy: SequenceRecoveryCopy) => Promise<boolean>; control: string;
}) {
  const prefix = sequenceRecoveryPrefix(userId, projectId);
  const ownKey = useRef<string>(undefined);
  const applied = useRef<Entry>(undefined);
  const latest = useRef({draft, dirty, version: saved.version});
  const [enabled, setEnabled] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [message, setMessage] = useState("");
  const [storageError, setStorageError] = useState("");
  const encodedDraft = JSON.stringify(draft);

  useEffect(() => { latest.current = {draft, dirty, version: saved.version}; }, [draft, dirty, saved.version]);

  useEffect(() => {
    function scan() {
      try {
        const copies: Entry[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key?.startsWith(prefix) || key === ownKey.current) continue;
          const raw = localStorage.getItem(key);
          const copy = parseSequenceRecovery(raw, userId, projectId);
          if (raw && copy) copies.push({key, raw, copy});
        }
        setEntries(copies.sort((a, b) => Date.parse(b.copy.saved_at) - Date.parse(a.copy.saved_at)));
      } catch { setStorageError("Browser storage is unavailable."); }
    }
    const initial = window.setTimeout(scan, 0);
    function changed(event: StorageEvent) {
      if (event.key === null || event.key.startsWith(prefix)) scan();
    }
    window.addEventListener("storage", changed);
    window.addEventListener("sequence-drafts-changed", scan);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("storage", changed);
      window.removeEventListener("sequence-drafts-changed", scan);
    };
  }, [prefix, userId, projectId]);

  useEffect(() => {
    if (!enabled) return;
    function flush(announce: boolean) {
      const key = ownKey.current;
      if (!key) return;
      const current = latest.current;
      try {
        if (!current.dirty) localStorage.removeItem(key);
        else localStorage.setItem(key, encodeSequenceRecovery(userId, projectId, current.version, current.draft));
        if (announce) {
          setStorageError("");
          setMessage(current.dirty ? "Sequence draft kept in this browser." : "Waiting for unsaved edits.");
        }
      } catch {
        if (announce) setStorageError("Could not keep a draft. Browser storage may be full or blocked.");
      }
    }
    const timer = window.setTimeout(() => flush(true), 200);
    const hide = () => flush(false);
    const visibility = () => { if (document.hidden) hide(); };
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [enabled, encodedDraft, dirty, saved.version, userId, projectId]);

  useEffect(() => {
    if (!saveReceipt || !applied.current) return;
    const entry = applied.current;
    applied.current = undefined;
    try {
      if (localStorage.getItem(entry.key) === entry.raw) localStorage.removeItem(entry.key);
      window.dispatchEvent(new Event("sequence-drafts-changed"));
    } catch { /* The server save succeeded even if browser cleanup failed. */ }
  }, [saveReceipt]);

  function enable() {
    ownKey.current ??= prefix + Array.from(crypto.getRandomValues(new Uint32Array(4))).join("-");
    setEnabled(true);
  }

  function remove(entry: Entry) {
    if (!window.confirm("Delete this browser draft? The saved sequence will stay unchanged.")) return;
    try {
      if (localStorage.getItem(entry.key) === entry.raw) localStorage.removeItem(entry.key);
      window.dispatchEvent(new Event("sequence-drafts-changed"));
    } catch { setStorageError("Could not remove the browser draft."); }
  }

  function download(entry: Entry) {
    const url = URL.createObjectURL(new Blob([entry.raw], {type: "application/json"}));
    const a = document.createElement("a");
    a.href = url;
    a.download = `indaverse-${projectId}-sequence-draft.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function restore(entry: Entry) {
    try {
      if (localStorage.getItem(entry.key) !== entry.raw) {
        window.dispatchEvent(new Event("sequence-drafts-changed"));
        setMessage("That browser draft changed. Review the latest copy.");
        return;
      }
    } catch { setStorageError("Could not read the browser draft."); return; }
    if (await onRestore(entry.copy)) {
      applied.current = entry;
      enable();
    }
  }

  return <section className="space-y-2 rounded border border-zinc-700 p-3" aria-label="Sequence draft recovery">
    <h3 className="font-semibold">Sequence draft recovery</h3>
    <p className="text-sm text-zinc-300">Keep unsaved clip, caption and soundtrack settings in this browser. Media files are not copied.</p>
    {!enabled && <button type="button" className={control} disabled={busy} onClick={enable}>Keep a sequence draft in this browser</button>}
    {enabled && <button type="button" className={control} disabled={busy} onClick={() => {
      if (!window.confirm("Stop keeping edits and delete this visit’s browser draft?")) return;
      try {
        if (ownKey.current) localStorage.removeItem(ownKey.current);
        ownKey.current = undefined;
        setEnabled(false);
        setMessage("Browser draft storage is off for this visit.");
      } catch { setStorageError("Could not remove the browser draft."); }
    }}>Stop keeping a browser draft</button>}
    {message && <p role="status">{message}</p>}
    {storageError && <p role="alert">{storageError}</p>}
    {!!entries.length && <ul className="space-y-2">
      {entries.map(entry => {
        const issue = recoveryIssue(entry.copy, saved);
        return <li key={entry.key} className="space-y-1 rounded border border-zinc-800 p-2">
          <p>Browser draft · version {entry.copy.base_version} · {new Date(entry.copy.saved_at).toLocaleString()}</p>
          {issue && <p>{issue} Download the edits for reference.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={control} disabled={busy || dirty || !!issue}
              onClick={() => void restore(entry)}>Restore sequence draft</button>
            <button type="button" className={control} disabled={busy} onClick={() => download(entry)}>Download sequence draft JSON</button>
            <button type="button" className={control} disabled={busy} onClick={() => remove(entry)}>Delete browser draft</button>
          </div>
        </li>;
      })}
    </ul>}
    {dirty && !!entries.length && <p className="text-sm text-zinc-300">Save or reload your current edits before restoring another draft.</p>}
  </section>;
}
