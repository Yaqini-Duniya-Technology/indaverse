"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export interface GenerationJob {
  id: number;
  project_id: number;
  provider: string;
  prompt: string;
  output_type: string;
  language: string;
  genre: string | null;
  mood: string | null;
  bpm: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface HistoryResponse {
  items: GenerationJob[];
  total: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 5;

function formatDate(value: string) {
  // Existing database timestamps are UTC without an explicit offset.
  const timestamp = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    ? value
    : `${value}Z`;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}

export default function GenerationHistory({
  projectId,
  generationStatus,
  onReuse,
  reuseDisabled,
}: {
  projectId: number;
  generationStatus: string;
  onReuse: (job: GenerationJob) => void;
  reuseDisabled: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (generationStatus === "preparing") return;

    let active = true;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await apiFetch<HistoryResponse>(
          `/api/v1/projects/${projectId}/music/jobs?limit=${PAGE_SIZE}&offset=${offset}`,
          { signal: controller.signal },
        );
        if (!active) return;

        if (offset > 0 && result.items.length === 0) {
          setOffset(Math.max(0, offset - PAGE_SIZE));
          return;
        }

        setHistory(result);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to load generation history.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [projectId, offset, revision, generationStatus]);

  const busy = loading || generationStatus === "preparing";
  const buttonClass =
    "rounded-lg border border-zinc-700 px-4 py-2 text-sm text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50";

  function refresh() {
    setOffset(0);
    setRevision((value) => value + 1);
  }

  return (
    <section
      id="generation-history"
      aria-labelledby="generation-history-title"
      aria-busy={busy}
      className="mx-auto my-10 w-full max-w-7xl px-6 text-white"
    >
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-violet-400">
              Your creative record
            </p>
            <h2 id="generation-history-title" className="mt-2 text-2xl font-semibold">
              Generation history
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Saved requests and their outcomes. An unavailable attempt produces no audio.
            </p>
          </div>
          <button type="button" onClick={refresh} disabled={busy} className={buttonClass}>
            {loading ? "Loading..." : error ? "Retry history" : "Refresh history"}
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-5 rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </p>
        )}

        {loading ? (
          <p role="status" className="mt-6 text-sm text-zinc-400">Loading saved requests...</p>
        ) : error ? null : history && history.items.length > 0 ? (
          <>
            <div className="mt-6 space-y-4">
              {history.items.map((job) => (
                <article key={job.id} className="rounded-xl border border-zinc-800 bg-black p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-medium">Request #{job.id}</h3>
                    <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs capitalize text-zinc-300">
                      {job.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">{formatDate(job.created_at)}</p>
                  <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-200">
                    {job.prompt}
                  </p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    {[
                      ["Output", job.output_type],
                      ["Language", job.language],
                      ["Genre", job.genre || "Not specified"],
                      ["Mood", job.mood || "Not specified"],
                      ["BPM", job.bpm ?? "Not specified"],
                      ["Provider", job.provider],
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <dt className="text-xs text-zinc-500">{label}</dt>
                        <dd className="mt-1 break-words text-zinc-300">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => onReuse(job)}
                      disabled={reuseDisabled}
                      className={buttonClass}
                    >
                      Reuse request
                    </button>
                    <p className="mt-2 text-xs text-zinc-500">
                      Restore these generation settings without starting generation.
                    </p>
                  </div>
                  {job.error_message && (
                    <p className="mt-4 rounded-lg bg-zinc-900 p-3 text-sm text-amber-200">
                      {job.error_message}
                    </p>
                  )}
                </article>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-zinc-400">
                {history.offset + 1}–{history.offset + history.items.length} of {history.total} requests
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  className={buttonClass}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={busy || offset + PAGE_SIZE >= history.total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  className={buttonClass}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="mt-6 rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-400">
            No generation requests saved yet. Your next attempt will appear here.
          </p>
        )}
      </div>
    </section>
  );
}
