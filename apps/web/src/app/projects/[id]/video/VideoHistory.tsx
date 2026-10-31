"use client";

import { useEffect, useState } from "react";
import {
  listVideoRevisions,
  type VideoRevision,
  type VideoRevisionPage,
} from "@/lib/video";

const button = "rounded-xl border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-40";

export default function VideoHistory({
  projectId, savedVersion, disabled, onRestore,
}: {
  projectId: number;
  savedVersion: number;
  disabled: boolean;
  onRestore: (revision: VideoRevision) => void;
}) {
  const [page, setPage] = useState<VideoRevisionPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setPage(null);
    setSelectedId(null);
    void listVideoRevisions(projectId, offset).then((result) => {
      if (active) setPage(result);
    }).catch((err) => {
      if (active) setError(err instanceof Error ? err.message : "Unable to load video history.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [projectId, savedVersion, offset, refresh]);

  const selected = page?.items.find((revision) => revision.id === selectedId);
  const busy = disabled || loading;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-black p-6" aria-labelledby="video-history-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="video-history-heading" className="text-2xl font-semibold">Saved video history</h2>
          <p className="mt-2 text-sm text-zinc-400">Review previous scripts and shot plans. Loading a revision does not save it.</p>
        </div>
        <button className={button} disabled={busy} onClick={() => {
          setOffset(0);
          setRefresh((value) => value + 1);
        }}>Refresh history</button>
      </div>

      {loading ? <p role="status" className="mt-5 text-zinc-400">Loading revisions...</p>
        : error ? (
          <div className="mt-5">
            <p role="alert" className="mb-3 text-red-300">{error}</p>
            <button className={button} disabled={disabled} onClick={() => setRefresh((value) => value + 1)}>Retry history</button>
          </div>
        ) : page && (
          <>
            {!page.items.length && <p className="mt-5 text-zinc-400">
              {page.total === 0
                ? "No revisions recorded yet. Your next changed save will preserve your video history."
                : "No revisions on this page. Return to an earlier page or refresh history."}
            </p>}
            <div className="mt-5 space-y-3">
              {page.items.map((revision) => (
                <article key={revision.id} className="rounded-xl border border-zinc-800 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words font-semibold">{revision.snapshot.title}</h3>
                      <p className="mt-1 text-sm text-zinc-400">
                        Version {revision.version} / {revision.reason} / {revision.snapshot.shots.length} shots
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">{new Date(revision.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className={button} disabled={disabled}
                        aria-expanded={selectedId === revision.id}
                        onClick={() => setSelectedId((current) => current === revision.id ? null : revision.id)}>
                        {selectedId === revision.id ? "Close details" : "Review"}
                      </button>
                      <button className={button} disabled={disabled} onClick={() => onRestore(revision)}>
                        Load into draft
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {selected && (
              <section className="mt-5 rounded-xl border border-violet-900 bg-violet-950/20 p-5"
                aria-label={`Details for version ${selected.version}`}>
                <h3 className="text-lg font-semibold">Version {selected.version} / {selected.snapshot.aspect_ratio}</h3>
                <h4 className="mt-4 font-medium">Saved script</h4>
                <p className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm leading-7 text-zinc-300">
                  {selected.snapshot.script || "No script in this revision."}
                </p>
                <h4 className="mt-5 font-medium">Shot sequence</h4>
                <ol className="mt-3 max-h-96 space-y-4 overflow-auto">
                  {selected.snapshot.shots.map((shot, index) => (
                    <li key={shot.id} className="rounded-lg border border-zinc-800 p-4">
                      <p className="break-words font-medium">{index + 1}. {shot.title} / {shot.duration_seconds}s</p>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-400">{shot.description || "No visual description."}</p>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-400">Camera: {shot.camera_direction || "Not set"}</p>
                      <p className="mt-2 text-xs text-zinc-500">{shot.image_id === null ? "No linked image" : `Linked project image #${shot.image_id}`}</p>
                    </li>
                  ))}
                </ol>
                {!selected.snapshot.shots.length && <p className="mt-2 text-sm text-zinc-400">No shots in this revision.</p>}
              </section>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button className={button} disabled={busy || offset === 0}
                onClick={() => setOffset((value) => Math.max(0, value - 10))}>Previous revisions</button>
              <span className="text-sm text-zinc-500">
                {page.items.length ? `${offset + 1}-${offset + page.items.length} of ${page.total}` : `${page.total} revisions`}
              </span>
              <button className={button} disabled={busy || offset + page.limit >= page.total}
                onClick={() => setOffset((value) => value + 10)}>Next revisions</button>
            </div>
          </>
        )}
    </section>
  );
}
