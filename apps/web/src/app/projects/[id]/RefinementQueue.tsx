"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import styles from "./workspace.module.css";
import { TaskEditor } from "./ReviewTasks";

interface Task {
  id: number;
  review_id: number;
  source_number: number;
  title: string;
  source_feedback: string;
  status: "todo" | "in_progress" | "done";
  resolution: string;
  version: number;
  updated_at: string;
}
interface TaskPage {
  items: Task[];
  has_more: boolean;
}
type Filter = "open" | "todo" | "in_progress" | "done" | "all";

export default function RefinementQueue({ projectId }: { projectId: number }) {
  const [filter, setFilter] = useState<Filter>("open");
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState<TaskPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Task | null>(null);
  const editorState = useRef({ dirty: false, busy: false });

  const trackEditor = useCallback(
    (state: { dirty: boolean; busy: boolean }) => {
      editorState.current = state;
    },
    [],
  );

  const taskSaved = useCallback(() => {
    setRefresh((value) => value + 1);
  }, []);

  function mayReplaceEditor() {
    if (editorState.current.busy) return false;
    return !editorState.current.dirty || window.confirm(
      "Discard this task draft? Export it from the editor first to keep a copy.",
    );
  }

  function openTask(task: Task) {
    if (selected?.id === task.id || !mayReplaceEditor()) return;
    editorState.current = { dirty: false, busy: false };
    setSelected(task);
  }

  function closeTask() {
    if (!mayReplaceEditor()) return;
    editorState.current = { dirty: false, busy: false };
    setSelected(null);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setPage(null);
    setError("");
    async function load() {
      try {
        const statusQuery = filter === "all" ? "" : `&task_status=${filter}`;
        const result = await apiFetch<TaskPage>(
          `/api/v1/projects/${projectId}/plan/tasks?limit=10&offset=${offset}${statusQuery}`,
        );
        if (active) setPage(result);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load refinement queue.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [projectId, filter, offset, refresh]);

  return (
    <section className="mt-6 rounded-xl border border-zinc-800 p-5"
      aria-labelledby="refinement-queue-heading">
      <p className={styles.eyebrow}>PROJECT REFINEMENTS</p>
      <h3 id="refinement-queue-heading" className="text-xl font-semibold">
        Refinement queue
      </h3>
      <p className="mt-2 text-sm text-zinc-400">
        Find saved tasks across all reviews. Open includes tasks marked To do or In progress.
        Open a task here to update its progress and change note.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="queue-filter" className="block text-sm">Show</label>
          <select id="queue-filter" value={filter}
            className="mt-2 rounded-lg border border-zinc-700 bg-black p-3"
            onChange={(event) => {
              setFilter(event.target.value as Filter);
              setOffset(0);
            }}>
            <option value="open">Open tasks</option>
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
            <option value="all">All tasks</option>
          </select>
        </div>
        <button type="button" className={styles.secondary} disabled={loading}
          onClick={() => setRefresh((value) => value + 1)}>Refresh queue</button>
      </div>
      {loading ? <p role="status" className="mt-4">Loading refinement queue...</p> :
        error ? <p role="alert" className="mt-4 text-red-300">{error}</p> :
        page && page.items.length === 0 ? (
          <p role="status" className="mt-4 text-sm text-zinc-400">
            No tasks on this page for the selected filter.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {page?.items.map((task) => (
              <article key={task.id} className="rounded-lg border border-zinc-800 p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <h4 className="font-medium">{task.title}</h4>
                  <span className="text-sm text-violet-300">
                    {task.status === "todo" ? "To do" :
                      task.status === "in_progress" ? "In progress" : "Done"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  Task #{task.id} / Review #{task.review_id} / Saved version {task.version}
                </p>
                <button type="button" className={`${styles.secondary} mt-3`}
                  onClick={() => openTask(task)}>
                  {selected?.id === task.id ? "Editor open below" : "Edit task"}
                </button>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer">Original feedback and saved changes</summary>
                  <p className="mt-3 whitespace-pre-wrap text-zinc-300">{task.source_feedback}</p>
                  <p className="mt-3 font-medium">Saved change note</p>
                  <p className="mt-1 whitespace-pre-wrap text-zinc-400">
                    {task.resolution || "No change note saved yet."}
                  </p>
                  <p className="mt-3 text-xs text-zinc-500">
                    Updated {new Date(task.updated_at).toLocaleString()}
                  </p>
                </details>
              </article>
            ))}
          </div>
        )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className={styles.secondary} disabled={loading || offset === 0}
          onClick={() => setOffset((value) => Math.max(0, value - 10))}>Previous</button>
        <span className="text-sm text-zinc-400">Page {offset / 10 + 1}</span>
        <button type="button" className={styles.secondary}
          disabled={loading || !!error || !page?.has_more}
          onClick={() => setOffset((value) => value + 10)}>Next</button>
      </div>
      {selected && (
        <section className="mt-6 rounded-xl border border-violet-800 p-4"
          aria-label={`Editor for task ${selected.id}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="font-semibold">
              Editing task #{selected.id} / Review #{selected.review_id}
            </h4>
            <button type="button" className={styles.secondary}
              onClick={closeTask}>Close editor</button>
          </div>
          <p className="my-3 text-sm text-zinc-400">
            Filtering or changing pages keeps this editor open.
            Your changes refer to the original review feedback.
          </p>
          <TaskEditor key={`queue-task:${selected.id}`}
            projectId={projectId} initial={selected}
            onStateChange={trackEditor} onSaved={taskSaved} />
        </section>
      )}
      <p className="mt-3 text-xs text-zinc-500">
        Refresh after saving a task. Task completion records your progress; it is not project approval.
      </p>
    </section>
  );
}
