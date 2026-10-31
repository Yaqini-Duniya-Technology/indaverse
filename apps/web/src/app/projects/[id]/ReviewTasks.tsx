"use client";

import { useEffect, useId, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import styles from "./workspace.module.css";
import StepAssetLinks from "./StepAssetLinks";
import type { PlanAssetReference } from "@/lib/projectPlan";

function evidenceKey(items: PlanAssetReference[]) {
  return JSON.stringify(items.map((item) => `${item.kind}:${item.id}`).sort());
}

type TaskStatus = "todo" | "in_progress" | "done";
export interface Task {
  id: number;
  review_id: number;
  source_number: number;
  title: string;
  source_feedback: string;
  status: TaskStatus;
  resolution: string;
  evidence?: PlanAssetReference[];
  version: number;
}
interface TaskPage {
  items: Task[];
  has_more: boolean;
}

export default function ReviewTasks({
  projectId, reviewId,
}: {
  projectId: number;
  reviewId: number;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    async function load() {
      try {
        const result = await apiFetch<TaskPage>(
          `/api/v1/projects/${projectId}/plan/tasks?review_id=${reviewId}&limit=100`,
        );
        if (result.has_more) throw new Error("Unable to display all tasks for this review.");
        if (active) setTasks(result.items);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load tasks.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [projectId, reviewId, retry]);

  async function create() {
    if (lock.current) return;
    lock.current = true;
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<Task[]>(
        `/api/v1/projects/${projectId}/plan/reviews/${reviewId}/tasks`,
        { method: "POST" },
      );
      setTasks(result);
      setNotice("Refinement tasks are ready. Existing tasks were kept.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create tasks.");
    } finally {
      lock.current = false;
      setCreating(false);
    }
  }

  return (
    <section className="mt-5 border-t border-zinc-800 pt-4"
      aria-label={`Refinement tasks for review ${reviewId}`}>
      <h6 className="font-semibold">Refinement tasks</h6>
      <p className="mt-2 text-sm text-zinc-400">
        Tasks refer to this review's original feedback and step titles.
        Completing them does not change plan progress or approve the project.
      </p>
      {notice && <p role="status" className="mt-3 text-sm text-emerald-300">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
      {loading ? <p role="status" className="mt-3 text-sm">Loading tasks...</p> : (
        <>
          {tasks.length === 0 && !error && (
            <button type="button" disabled={creating}
              className={`${styles.secondary} mt-3`}
              onClick={() => void create()}>
              {creating ? "Creating..." : "Create refinement tasks"}
            </button>
          )}
          {error && (
            <button type="button" disabled={creating}
              className={`${styles.secondary} mt-3`}
              onClick={() => setRetry((value) => value + 1)}>Retry loading tasks</button>
          )}
          <div className="mt-4 space-y-4">
            {tasks.map((task) => (
              <TaskEditor key={task.id} projectId={projectId} initial={task} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function TaskEditor({
  projectId, initial, onStateChange, onSaved,
}: {
  projectId: number;
  initial: Task;
  onStateChange?: (state: { dirty: boolean; busy: boolean }) => void;
  onSaved?: (task: Task) => void;
}) {
  const inputId = useId();
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState<TaskStatus>(initial.status);
  const [resolution, setResolution] = useState(initial.resolution);
  const [evidence, setEvidence] = useState<PlanAssetReference[]>(initial.evidence ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const dirty = status !== saved.status || resolution !== saved.resolution ||
    evidenceKey(evidence) !== evidenceKey(saved.evidence ?? []);

  useEffect(() => {
    onStateChange?.({ dirty, busy });
  }, [dirty, busy, onStateChange]);

  useEffect(() => {
    if (!dirty && !busy) return;
    function unload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    function navigate(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") return;
      const destination = new URL(anchor.href);
      const current = new URL(window.location.href);
      if (destination.origin === current.origin &&
          destination.pathname === current.pathname &&
          destination.search === current.search) return;
      if (busy || !window.confirm("Leave without saving your refinement task changes?")) {
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
  }, [dirty, busy]);

  async function save() {
    if (lock.current || !dirty) return;
    if (status === "done" && !resolution.trim()) {
      setError("Describe what you changed before marking the task done.");
      return;
    }
    lock.current = true;
    onStateChange?.({ dirty, busy: true });
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<Task>(
        `/api/v1/projects/${projectId}/plan/tasks/${saved.id}`,
        {
          method: "PATCH",
          body: {
            expected_version: saved.version,
            status,
            resolution,
            evidence,
          },
        },
      );
      setSaved(result);
      setStatus(result.status);
      setResolution(result.resolution);
      setEvidence(result.evidence ?? []);
      setNotice("Task saved.");
      onSaved?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save task.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function loadLatest() {
    if (lock.current) return;
    if (dirty && !window.confirm(
      "Replace your task draft with the latest saved task? Export your draft first to keep it.",
    )) return;
    lock.current = true;
    onStateChange?.({ dirty, busy: true });
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<TaskPage>(
        `/api/v1/projects/${projectId}/plan/tasks?review_id=${saved.review_id}&limit=100`,
      );
      const latest = result.items.find((task) => task.id === saved.id);
      if (!latest) throw new Error("This task is no longer available.");
      setSaved(latest);
      setStatus(latest.status);
      setResolution(latest.resolution);
      setEvidence(latest.evidence ?? []);
      setNotice("Latest saved task loaded.");
      onSaved?.(latest);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reload task.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function exportDraft() {
    const blob = new Blob([JSON.stringify({
      project_id: projectId,
      task_id: saved.id,
      review_id: saved.review_id,
      expected_version: saved.version,
      title: saved.title,
      source_feedback: saved.source_feedback,
      status,
      resolution,
      evidence,
    }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `indaverse-task-${saved.id}-draft.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="rounded-lg border border-zinc-700 p-4">
      <p className="font-medium">{saved.title}</p>
      <p className="mt-1 text-xs text-zinc-500">
        Task #{saved.id} / saved version {saved.version}
      </p>
      <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">
        {saved.source_feedback}
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-emerald-300">{notice}</p>}
      <fieldset disabled={busy} className="mt-4">
        <legend className="text-sm">Your refinement progress</legend>
        <label htmlFor={`task-status-${inputId}`} className="mt-2 block text-sm">Status</label>
        <select id={`task-status-${inputId}`} value={status}
          className="mt-2 w-full rounded-lg border border-zinc-700 bg-black p-3"
          onChange={(event) => setStatus(event.target.value as TaskStatus)}>
          <option value="todo">To do</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
        </select>
        <label htmlFor={`task-resolution-${inputId}`} className="mt-4 block text-sm">
          What changed? (required when done)
        </label>
        <textarea id={`task-resolution-${inputId}`} rows={3} maxLength={5000}
          value={resolution}
          className="mt-2 w-full rounded-lg border border-zinc-700 bg-black p-3"
          onChange={(event) => setResolution(event.target.value)} />
        <StepAssetLinks projectId={projectId} assets={evidence}
          disabled={busy} onChange={setEvidence} context="task" />
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" disabled={!dirty}
            className={`${styles.primary} disabled:opacity-50`}
            onClick={() => void save()}>{busy ? "Please wait..." : "Save task"}</button>
          <button type="button" className={styles.secondary}
            onClick={() => void loadLatest()}>Load latest task</button>
          <button type="button" className={styles.secondary}
            onClick={exportDraft}>Export task draft</button>
        </div>
      </fieldset>
    </div>
  );
}
