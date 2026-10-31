"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  getCreativeBrief, saveCreativeBrief,
  type CreativeBrief, type BriefDraft,
} from "@/lib/creativeBrief";
import styles from "./workspace.module.css";

const empty: BriefDraft = { goal: "", audience: "", style: "", constraints: "" };
const fields = [
  { key: "goal", label: "Creative goal", max: 5000,
    hint: "What should this project achieve?" },
  { key: "audience", label: "Audience", max: 2000,
    hint: "Who is it for? Include languages or cultural context." },
  { key: "style", label: "Style and direction", max: 2000,
    hint: "Describe the tone, genre, mood, or visual direction." },
  { key: "constraints", label: "Requirements and constraints", max: 5000,
    hint: "Include duration, formats, must-haves, and things to avoid." },
] as const;

function draftOf(brief: CreativeBrief): BriefDraft {
  return {
    goal: brief.goal, audience: brief.audience,
    style: brief.style, constraints: brief.constraints,
  };
}

export default function CreativeBriefEditor({ projectId }: { projectId: number }) {
  const [saved, setSaved] = useState<CreativeBrief | null>(null);
  const [draft, setDraft] = useState<BriefDraft>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  const dirty = saved !== null &&
    fields.some(({ key }) => draft[key] !== saved[key]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setNotice("");
    void getCreativeBrief(projectId).then((brief) => {
      if (!active) return;
      setSaved(brief);
      setDraft(draftOf(brief));
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : "Unable to load brief.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [projectId, retry]);

  useEffect(() => {
    if (!dirty && !saving) return;
    function unload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    function navigate(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const target = new URL(anchor.href);
      const current = new URL(window.location.href);
      if (target.origin === current.origin &&
          target.pathname === current.pathname &&
          target.search === current.search) return;
      if (saving || !window.confirm("Leave without saving your creative brief?")) {
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

  function reload() {
    if (lock.current) return;
    if (dirty && !window.confirm(
      "Replace your unsaved brief with the latest saved version? Copy your draft first.",
    )) return;
    setRetry((value) => value + 1);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!saved || lock.current || loading) return;
    lock.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await saveCreativeBrief(projectId, draft, saved.version);
      setSaved(result);
      setDraft(draftOf(result));
      setNotice("Creative brief saved.");
      window.dispatchEvent(new Event("indaverse:brief-saved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save brief.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="mt-8 border-t border-zinc-800 pt-8">
      <p className={styles.eyebrow}>CREATIVE BRIEF</p>
      <h2>Your project's direction</h2>
      <p className="mt-2 text-sm text-zinc-400">
        Keep your goal, audience, style, and requirements together.
      </p>
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      {notice && <p role="status" className="mt-4 text-sm text-emerald-300">{notice}</p>}
      {loading ? <p className="mt-4" role="status">Loading creative brief...</p> : saved ? (
        <form onSubmit={save} className="mt-5 space-y-5" aria-busy={saving}>
          {fields.map(({ key, label, max, hint }) => (
            <div key={key}>
              <label htmlFor={`brief-${key}`} className="text-sm text-zinc-300">{label}</label>
              <textarea
                id={`brief-${key}`}
                value={draft[key]}
                onChange={(event) => setDraft((value) => ({
                  ...value, [key]: event.target.value,
                }))}
                maxLength={max}
                rows={3}
                disabled={saving}
                aria-describedby={`brief-${key}-hint`}
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none focus:border-violet-400 disabled:opacity-60"
              />
              <p id={`brief-${key}-hint`} className="mt-1 text-xs text-zinc-400">
                {hint} {draft[key].length}/{max}
              </p>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving || !dirty}
              className={`${styles.primary} disabled:opacity-50`}>
              {saving ? "Saving..." : "Save creative brief"}
            </button>
            <button type="button" onClick={reload} disabled={saving}
              className={styles.secondary}>Load latest saved brief</button>
            <span className="text-sm text-zinc-400">
              {dirty ? "Unsaved brief edits" : "Brief is up to date"}
            </span>
          </div>
        </form>
      ) : (
        <button type="button" onClick={reload} className={styles.secondary}>Retry loading brief</button>
      )}
    </div>
  );
}
