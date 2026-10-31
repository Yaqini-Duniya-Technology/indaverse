"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export interface SongSnapshot {
  title: string;
  artist: string | null;
  genre: string | null;
  mood: string | null;
  bpm: number | null;
  lyrics_intro: string | null;
  lyrics_verse_1: string | null;
  lyrics_chorus: string | null;
  lyrics_verse_2: string | null;
  lyrics_bridge: string | null;
  lyrics_outro: string | null;
}

export interface SongRevision {
  id: number;
  project_id: number;
  reason: string;
  snapshot: SongSnapshot;
  created_at: string;
}

interface HistoryResponse {
  items: SongRevision[];
  total: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 5;
const buttonClass =
  "rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-900 disabled:opacity-50";

function localDate(value: string) {
  const utc = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`;
  return new Date(utc).toLocaleString();
}

export default function SongHistory({
  projectId,
  disabled,
  onLoad,
}: {
  projectId: number;
  disabled: boolean;
  onLoad: (revision: SongRevision) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");

    void apiFetch<HistoryResponse>(
      `/api/v1/projects/${projectId}/music/revisions?limit=${PAGE_SIZE}&offset=${offset}`,
      { signal: controller.signal },
    ).then((result) => {
      if (!active) return;
      if (offset > 0 && result.items.length === 0) {
        setOffset(Math.max(0, offset - PAGE_SIZE));
        return;
      }
      setHistory(result);
    }).catch((err: unknown) => {
      if (active) setError(
        err instanceof Error ? err.message : "Unable to load song history.",
      );
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [projectId, offset, refresh]);

  function reload() {
    setOffset(0);
    setRefresh((value) => value + 1);
  }

  return (
    <section id="song-history" className="mx-auto max-w-7xl px-6 py-8">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Song History</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Review saved versions. Loading one changes your draft;
              use Save Song to keep it.
            </p>
          </div>
          <button type="button" className={buttonClass}
            disabled={loading || disabled} onClick={reload}>
            Refresh
          </button>
        </div>

        {loading ? (
          <p role="status" className="mt-6 text-zinc-400">Loading song history...</p>
        ) : error ? (
          <div className="mt-6">
            <p role="alert" className="text-red-300">{error}</p>
            <button type="button" className={`${buttonClass} mt-3`}
              disabled={disabled} onClick={reload}>Retry</button>
          </div>
        ) : history?.items.length === 0 ? (
          <p className="mt-6 text-zinc-400">
            No saved revisions yet. History begins when you create
            a song or save a change to an existing song.
          </p>
        ) : (
          <>
            <div className="mt-6 space-y-4">
              {history?.items.map((revision) => {
                const song = revision.snapshot;
                const lyrics = [
                  ["Intro", song.lyrics_intro],
                  ["Verse 1", song.lyrics_verse_1],
                  ["Chorus", song.lyrics_chorus],
                  ["Verse 2", song.lyrics_verse_2],
                  ["Bridge", song.lyrics_bridge],
                  ["Outro", song.lyrics_outro],
                ];
                return (
                  <article key={revision.id}
                    className="rounded-xl border border-zinc-800 bg-black p-5">
                    <h3 className="font-semibold">{song.title}</h3>
                    <p className="mt-2 text-sm text-zinc-400">
                      Revision #{revision.id} ? {revision.reason.replaceAll("_", " ")}
                      {" ? "}{localDate(revision.created_at)}
                    </p>
                    <details className="mt-4">
                      <summary className="cursor-pointer text-sm text-violet-300">
                        Preview this version
                      </summary>
                      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                        {[
                          ["Artist", song.artist], ["Genre", song.genre],
                          ["Mood", song.mood], ["BPM", song.bpm],
                        ].map(([label, value]) => (
                          <div key={String(label)}>
                            <dt className="text-zinc-500">{label}</dt>
                            <dd>{value ?? "Not set"}</dd>
                          </div>
                        ))}
                      </dl>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {lyrics.map(([label, value]) => (
                          <div key={label}>
                            <h4 className="text-sm font-semibold">{label}</h4>
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-400">
                              {value || "No lyrics added."}
                            </p>
                          </div>
                        ))}
                      </div>
                    </details>
                    <button type="button" className={`${buttonClass} mt-4`}
                      disabled={disabled} onClick={() => onLoad(revision)}>
                      Load into editor
                    </button>
                  </article>
                );
              })}
            </div>
            {history && (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button type="button" className={buttonClass}
                  disabled={disabled || offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                  Previous
                </button>
                <span className="text-sm text-zinc-400">
                  {offset + 1}-{offset + history.items.length} of {history.total}
                </span>
                <button type="button" className={buttonClass}
                  disabled={disabled || offset + history.items.length >= history.total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}>
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
