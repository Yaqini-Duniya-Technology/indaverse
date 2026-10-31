"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { getCreativeBrief, type CreativeBrief } from "@/lib/creativeBrief";
import {
  getProjectPlan, createProjectPlan, saveProjectPlan, reviewProjectPlan,
  type ProjectPlan, type PlanStep,
} from "@/lib/projectPlan";
import styles from "./workspace.module.css";
import StepAssetLinks from "./StepAssetLinks";
import ProjectReviews from "./ProjectReviews";

export default function ProjectPlanEditor({ projectId }: { projectId: number }) {
  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  const [brief, setBrief] = useState<CreativeBrief | null>(null);
  const [steps, setSteps] = useState<PlanStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  const dirty = plan !== null && JSON.stringify(steps) !== JSON.stringify(plan.steps);
  const stale = plan !== null && brief !== null && plan.brief_version !== brief.version;
  const completed = steps.filter((step) => step.status === "done").length;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setNotice("");
    async function load() {
      try {
        const [savedBrief, savedPlan] = await Promise.all([
          getCreativeBrief(projectId),
          getProjectPlan(projectId).catch((err: unknown) => {
            if (err instanceof ApiError && err.status === 404) return null;
            throw err;
          }),
        ]);
        if (!active) return;
        setBrief(savedBrief);
        setPlan(savedPlan);
        setSteps(savedPlan?.steps.map((step) => ({ ...step })) ?? []);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load project plan.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [projectId, retry]);

  useEffect(() => {
    let active = true;
    function refreshBrief() {
      void getCreativeBrief(projectId).then((value) => {
        if (active) setBrief(value);
      }).catch(() => {
        if (active) setError("Unable to check the latest brief. Retry before creating a plan.");
      });
    }
    window.addEventListener("indaverse:brief-saved", refreshBrief);
    window.addEventListener("focus", refreshBrief);
    return () => {
      active = false;
      window.removeEventListener("indaverse:brief-saved", refreshBrief);
      window.removeEventListener("focus", refreshBrief);
    };
  }, [projectId]);

  useEffect(() => {
    if (!dirty && !busy) return;
    function unload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    function navigate(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const destination = new URL(anchor.href);
      const current = new URL(window.location.href);
      if (destination.origin === current.origin &&
          destination.pathname === current.pathname &&
          destination.search === current.search) return;
      if (busy || !window.confirm("Leave without saving your plan edits?")) {
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

  function reload() {
    if (lock.current) return;
    if (dirty && !window.confirm("Replace your draft with the saved plan? Export your draft first.")) return;
    setRetry((value) => value + 1);
  }

  function exportDraft() {
    const blob = new Blob([JSON.stringify({
      project_id: projectId,
      brief_snapshot: plan?.brief_snapshot,
      steps,
    }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `indaverse-project-${projectId}-plan-draft.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function persist(create: boolean) {
    if (lock.current || loading || !brief) return;
    if (!create && !plan) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = create
        ? await createProjectPlan(projectId, brief.version)
        : await saveProjectPlan(projectId, plan!.version, steps);
      setPlan(result);
      setSteps(result.steps.map((step) => ({ ...step })));
      setNotice(create ? "Project plan created." : "Project plan saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save plan.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function markReviewed() {
    if (lock.current || loading || dirty || !plan || !brief || !stale) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await reviewProjectPlan(projectId, plan.version, brief.version);
      setPlan(result);
      setNotice("Plan marked reviewed against the saved brief. Steps and progress were kept.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to record the review.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void persist(false);
  }

  function edit(index: number, patch: Partial<PlanStep>) {
    setSteps((current) => current.map((step, position) =>
      position === index ? { ...step, ...patch } : step));
  }

  const inputClass = "mt-2 w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none focus:border-violet-400 disabled:opacity-60";

  return (
    <section className={styles.panel} style={{ marginBottom: "24px" }} aria-labelledby="plan-heading">
      <p className={styles.eyebrow}>PROJECT PLAN</p>
      <h2 id="plan-heading">Turn your brief into next steps</h2>
      <p className="mt-2 text-sm text-zinc-400">
        Start with a template, then adapt the steps to your project.
      </p>
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      {notice && <p role="status" className="mt-4 text-sm text-emerald-300">{notice}</p>}
      {loading ? <p role="status" className="mt-4">Loading project plan...</p> : !brief ? (
        <button type="button" className={styles.secondary} onClick={reload}>Retry</button>
      ) : !plan ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm text-zinc-400">
            {brief.goal.trim() ? "Create a plan from your saved creative brief." : "Save a creative goal in the brief above first."}
          </p>
          <button type="button" disabled={busy || !brief.goal.trim()}
            className={`${styles.primary} disabled:opacity-50`}
            onClick={() => void persist(true)}>
            {busy ? "Creating..." : "Create project plan"}
          </button>
          <button type="button" disabled={busy} className={styles.secondary} onClick={reload}>Refresh</button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-5" aria-busy={busy}>
          {stale && brief && (
            <div className="rounded-lg border border-amber-800 p-4">
              <p role="status" className="text-sm text-amber-200">
                The saved brief changed. Compare it below, then review your steps.
                Marking reviewed records the current brief without changing your steps or progress.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="mb-3 text-left text-zinc-400">
                    Recorded brief version {plan.brief_version} and current version {brief.version}
                  </caption>
                  <thead>
                    <tr className="border-b border-zinc-700">
                      <th scope="col" className="p-3">Field</th>
                      <th scope="col" className="p-3">Recorded brief</th>
                      <th scope="col" className="p-3">Current saved brief</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["goal", "audience", "style", "constraints"] as const).map((field) => {
                      const oldValue = plan.brief_snapshot[field] || "";
                      const currentValue = brief[field];
                      return (
                        <tr key={field} className="border-b border-zinc-800">
                          <th scope="row" className="p-3 align-top capitalize">
                            {field}
                            {oldValue !== currentValue && (
                              <span className="mt-1 block text-xs text-amber-200">Changed</span>
                            )}
                          </th>
                          <td className="min-w-48 whitespace-pre-wrap break-words p-3 align-top text-zinc-400">
                            {oldValue || "Not set"}
                          </td>
                          <td className="min-w-48 whitespace-pre-wrap break-words p-3 align-top text-zinc-200">
                            {currentValue || "Not set"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button type="button" disabled={busy || dirty}
                className={`${styles.secondary} mt-4 disabled:opacity-50`}
                onClick={() => void markReviewed()}>
                {busy ? "Please wait..." : "Mark plan reviewed against this brief"}
              </button>
              {dirty && (
                <p className="mt-2 text-sm text-zinc-400">
                  Save your step edits before marking the plan reviewed.
                </p>
              )}
            </div>
          )}
          <p className="text-sm text-zinc-300">
            {completed} of {steps.length} steps complete{dirty ? " (includes unsaved edits)" : ""}
          </p>
          <progress className="w-full accent-violet-400" value={completed} max={steps.length}
            aria-label="Project plan completion" />
          <details className="text-sm text-zinc-400">
            <summary className="cursor-pointer">Recorded brief for this plan</summary>
            {Object.entries(plan.brief_snapshot).map(([key, value]) => (
              <p key={key} className="mt-3 whitespace-pre-wrap"><strong className="capitalize">{key}: </strong>{value || "Not set"}</p>
            ))}
          </details>
          {steps.map((step, index) => (
            <fieldset key={index} disabled={busy} className="rounded-xl border border-zinc-800 p-4">
              <legend className="px-2 text-sm text-zinc-400">Step {index + 1}</legend>
              <label htmlFor={`plan-title-${index}`} className="text-sm">Title</label>
              <input id={`plan-title-${index}`} required maxLength={200} value={step.title}
                onChange={(event) => edit(index, { title: event.target.value })} className={inputClass} />
              <label htmlFor={`plan-notes-${index}`} className="mt-4 block text-sm">Notes</label>
              <textarea id={`plan-notes-${index}`} rows={3} maxLength={5000} value={step.notes}
                onChange={(event) => edit(index, { notes: event.target.value })} className={inputClass} />
              <label htmlFor={`plan-status-${index}`} className="mt-4 block text-sm">Progress</label>
              <select id={`plan-status-${index}`} value={step.status} className={inputClass}
                onChange={(event) => edit(index, { status: event.target.value as PlanStep["status"] })}>
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
              <StepAssetLinks
                projectId={projectId}
                assets={step.assets ?? []}
                disabled={busy}
                onChange={(assets) => edit(index, { assets })}
              />
              <button type="button" disabled={steps.length <= 1} className="mt-3 text-sm text-red-300 disabled:opacity-50"
                onClick={() => setSteps((current) => current.filter((_, position) => position !== index))}>
                Remove step
              </button>
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy || steps.length >= 50} className={styles.secondary}
              onClick={() => setSteps((current) => [...current, { title: "New step", notes: "", status: "todo" }])}>
              Add step
            </button>
            <button type="submit" disabled={busy || !dirty || steps.some((step) => !step.title.trim())}
              className={`${styles.primary} disabled:opacity-50`}>
              {busy ? "Saving..." : "Save plan"}
            </button>
            <button type="button" disabled={busy} className={styles.secondary} onClick={reload}>Load saved plan</button>
            <button type="button" className={styles.secondary} onClick={exportDraft}>Export draft</button>
          </div>
        </form>
      )}
      {plan && brief && (
        <ProjectReviews
          key={`reviews:${projectId}`}
          projectId={projectId}
          plan={plan}
          briefVersion={brief.version}
          disabled={loading || busy || dirty}
        />
      )}
    </section>
  );
}
