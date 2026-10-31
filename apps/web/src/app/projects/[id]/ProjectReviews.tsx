"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { ProjectPlan } from "@/lib/projectPlan";
import styles from "./workspace.module.css";
import ReviewTasks from "./ReviewTasks";
import RefinementQueue from "./RefinementQueue";

type Decision = "needs_changes" | "approved";
interface Review {
  id: number;
  plan_version: number;
  brief_version: number;
  decision: Decision;
  summary: string;
  step_feedback: { step_number: number; note: string }[];
  plan_snapshot: {
    brief: Record<string, string>;
    steps: { title: string; notes: string; status: string }[];
  };
  created_at: string;
}
interface ReviewPage {
  items: Review[];
  has_more: boolean;
}

export default function ProjectReviews({
  projectId, plan, briefVersion, disabled,
}: {
  projectId: number;
  plan: ProjectPlan;
  briefVersion: number;
  disabled: boolean;
}) {
  const [basis, setBasis] = useState(() => ({
    planVersion: plan.version,
    briefVersion,
    steps: structuredClone(plan.steps),
  }));
  const [decision, setDecision] = useState<Decision>("needs_changes");
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [reviews, setReviews] = useState<Review[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const draft = summary !== "" || Object.values(notes).some((value) => value !== "");
  const outdated = basis.planVersion !== plan.version ||
    basis.briefVersion !== briefVersion;
  const blocked = disabled || outdated || plan.brief_version !== briefVersion;

  function exportReviewDraft() {
    const blob = new Blob([JSON.stringify({
      project_id: projectId,
      plan_version: basis.planVersion,
      brief_version: basis.briefVersion,
      reviewed_steps: basis.steps,
      decision,
      summary,
      step_feedback: Object.entries(notes)
        .filter(([, note]) => note.trim())
        .map(([number, note]) => ({ step_number: Number(number), note })),
    }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `indaverse-project-${projectId}-review-draft.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function startCurrentReview() {
    if (saving || disabled || lock.current) return;
    if (draft && !window.confirm(
      "Clear this review draft and start against the current saved plan? Export your draft first to keep it.",
    )) return;
    setBasis({
      planVersion: plan.version,
      briefVersion,
      steps: structuredClone(plan.steps),
    });
    setSummary("");
    setNotes({});
    setDecision("needs_changes");
    setSaveError("");
    setNotice("Started a review of the current saved plan.");
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    async function load() {
      try {
        const result = await apiFetch<ReviewPage>(
          `/api/v1/projects/${projectId}/plan/reviews?limit=10&offset=${offset}`,
        );
        if (active) {
          setReviews(result.items);
          setHasMore(result.has_more);
        }
      } catch (err) {
        if (active) setLoadError(err instanceof Error ? err.message : "Unable to load reviews.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [projectId, offset, refresh]);

  useEffect(() => {
    if (!draft && !saving) return;
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
      if (saving || !window.confirm("Leave without recording your review feedback?")) {
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
  }, [draft, saving]);

  async function record() {
    if (lock.current || blocked || !summary.trim()) return;
    lock.current = true;
    setSaving(true);
    setSaveError("");
    setNotice("");
    try {
      await apiFetch<Review>(`/api/v1/projects/${projectId}/plan/reviews`, {
        method: "POST",
        body: {
          expected_plan_version: basis.planVersion,
          expected_brief_version: basis.briefVersion,
          decision,
          summary: summary.trim(),
          step_feedback: Object.entries(notes)
            .filter(([, note]) => note.trim())
            .map(([number, note]) => ({ step_number: Number(number), note: note.trim() })),
        },
      });
      setSummary("");
      setNotes({});
      setOffset(0);
      setRefresh((value) => value + 1);
      setNotice("Your review was recorded. It does not automatically change plan progress.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unable to record review.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  const inputClass = "mt-2 w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white";
  return (
    <section className="mt-6 border-t border-zinc-800 pt-6" aria-labelledby="reviews-heading">
      <p className={styles.eyebrow}>HUMAN REVIEW</p>
      <h3 id="reviews-heading" className="text-xl font-semibold">Review and refinement records</h3>
      <p className="mt-2 text-sm text-zinc-400">
        Record your assessment of saved plan version {basis.planVersion}, brief version {basis.briefVersion}.
        Approval is your decision; it is not an automated quality or readiness check.
      </p>
      {blocked && <p role="status" className="mt-3 text-sm text-amber-200">
        Save your plan edits and review it against the latest brief before recording feedback.
      </p>}
      {outdated && (
        <div className="mt-4 rounded-lg border border-amber-800 p-4">
          <p role="status" className="text-sm text-amber-200">
            The saved plan or brief changed. Your draft still refers to its original
            steps and cannot be submitted against the newer version.
          </p>
          <button type="button" disabled={disabled || saving}
            className={`${styles.secondary} mt-3`}
            onClick={startCurrentReview}>Start review of current plan</button>
        </div>
      )}
      <button type="button" disabled={saving || !draft}
        className={`${styles.secondary} mt-3`}
        onClick={exportReviewDraft}>Export review draft</button>
      {saveError && <p role="alert" className="mt-3 text-red-300">{saveError}</p>}
      {notice && <p role="status" className="mt-3 text-emerald-300">{notice}</p>}
      <fieldset disabled={blocked || saving} className="mt-4 space-y-4 disabled:opacity-60">
        <legend className="text-sm">Your assessment</legend>
        <div>
          <label htmlFor="review-decision">Decision</label>
          <select id="review-decision" className={inputClass} value={decision}
            onChange={(event) => setDecision(event.target.value as Decision)}>
            <option value="needs_changes">Needs changes</option>
            <option value="approved">Approved by me</option>
          </select>
        </div>
        <div>
          <label htmlFor="review-summary">Summary (required)</label>
          <textarea id="review-summary" rows={3} maxLength={5000}
            className={inputClass} value={summary}
            onChange={(event) => setSummary(event.target.value)} />
        </div>
        <details>
          <summary className="cursor-pointer">Optional feedback for individual steps</summary>
          {basis.steps.map((step, index) => (
            <div key={index} className="mt-4">
              <label htmlFor={`review-step-${index}`}>
                Step {index + 1}: {step.title}
              </label>
              <textarea id={`review-step-${index}`} rows={2} maxLength={2000}
                className={inputClass} value={notes[index + 1] ?? ""}
                onChange={(event) => setNotes((current) => ({
                  ...current, [index + 1]: event.target.value,
                }))} />
            </div>
          ))}
        </details>
        <button type="button" disabled={!summary.trim() || saving}
          className={`${styles.primary} disabled:opacity-50`} onClick={() => void record()}>
          {saving ? "Recording..." : "Record review"}
        </button>
      </fieldset>

      <RefinementQueue projectId={projectId} />
      <h4 className="mt-8 font-semibold">Saved reviews</h4>
      <button type="button" disabled={loading || saving} className={`${styles.secondary} mt-3`}
        onClick={() => setRefresh((value) => value + 1)}>Refresh history</button>
      {loading ? <p role="status" className="mt-3">Loading reviews...</p> :
        loadError ? <p role="alert" className="mt-3 text-red-300">{loadError}</p> :
        reviews.length === 0 ? <p className="mt-3 text-zinc-400">No reviews on this page.</p> :
        <div className="mt-4 space-y-4">
          {reviews.map((review) => (
            <article key={review.id} className="rounded-xl border border-zinc-800 p-4">
              <h5 className="font-semibold">
                {review.decision === "approved" ? "Approved by owner" : "Needs changes"}
              </h5>
              <p className="mt-1 text-xs text-zinc-400">
                Review #{review.id} ? Plan v{review.plan_version} ? Brief v{review.brief_version}
                {" ? "}{new Date(review.created_at).toLocaleString()}
              </p>
              {(review.plan_version !== plan.version || review.brief_version !== briefVersion) &&
                <p className="mt-2 text-xs text-amber-200">Historical review: the current plan or brief has changed.</p>}
              <p className="mt-3 whitespace-pre-wrap">{review.summary}</p>
              {review.step_feedback.map((feedback) => (
                <div key={feedback.step_number} className="mt-3">
                  <p className="text-sm font-semibold">
                    Step {feedback.step_number}: {review.plan_snapshot.steps[feedback.step_number - 1]?.title}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-zinc-300">{feedback.note}</p>
                </div>
              ))}
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer">View the saved plan reviewed</summary>
                <div className="mt-3 space-y-3">
                  {Object.entries(review.plan_snapshot.brief).map(([field, value]) => (
                    <p key={field} className="whitespace-pre-wrap"><strong>{field}: </strong>{value || "Not set"}</p>
                  ))}
                  {review.plan_snapshot.steps.map((step, index) => (
                    <div key={index}>
                      <p>{index + 1}. {step.title} ({step.status.replaceAll("_", " ")})</p>
                      <p className="whitespace-pre-wrap text-zinc-400">{step.notes}</p>
                    </div>
                  ))}
                </div>
              </details>
              {review.decision === "needs_changes" && (
                <ReviewTasks projectId={projectId} reviewId={review.id} />
              )}
            </article>
          ))}
        </div>}
      <div className="mt-4 flex gap-3">
        <button type="button" className={styles.secondary} disabled={loading || offset === 0}
          onClick={() => setOffset((value) => Math.max(0, value - 10))}>Previous</button>
        <button type="button" className={styles.secondary} disabled={loading || !!loadError || !hasMore}
          onClick={() => setOffset((value) => value + 10)}>Next</button>
      </div>
    </section>
  );
}
