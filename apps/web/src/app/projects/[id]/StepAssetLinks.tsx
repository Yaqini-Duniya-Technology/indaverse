"use client";

import { useEffect, useId, useState } from "react";
import LinkedAssetPreview from "./LinkedAssetPreview";
import {
  getPlanAssets, type PlanAssetReference, type PlanAssetPage,
} from "@/lib/projectPlan";

export default function StepAssetLinks({
  projectId, assets, disabled, onChange, context = "step",
}: {
  projectId: number;
  assets: PlanAssetReference[];
  disabled: boolean;
  onChange: (assets: PlanAssetReference[]) => void;
  context?: "step" | "task";
}) {
  const selectId = useId();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PlanAssetReference["kind"]>("audio");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<PlanAssetPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    setPage(null);
    void getPlanAssets(projectId, kind, offset).then((result) => {
      if (active) setPage(result);
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : "Unable to load assets.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [projectId, kind, offset, open, retry]);

  function link(asset: PlanAssetReference) {
    if (disabled || assets.length >= 20) return;
    if (assets.some((item) => item.kind === asset.kind && item.id === asset.id)) return;
    onChange([...assets, { kind: asset.kind, id: asset.id }]);
  }

  return (
    <div className="mt-5 border-t border-zinc-800 pt-4">
      <p className="text-sm font-medium">{context === "task" ? "Refinement evidence" : "Linked assets"}</p>
      <p className="mt-1 text-xs text-zinc-400">
        {context === "task"
          ? "Link saved work that shows your changes. Save the task to keep these references. Links do not approve the project."
          : "References connect this step to saved work. Save the plan to keep link changes."}
      </p>
      {assets.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No linked assets yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {assets.map((asset) => (
            <li key={`${asset.kind}:${asset.id}`} className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <LinkedAssetPreview projectId={projectId} asset={asset} />
              <button type="button" disabled={disabled} className="text-red-300 disabled:opacity-50"
                onClick={() => onChange(assets.filter((item) =>
                  !(item.kind === asset.kind && item.id === asset.id)))}>
                Remove link
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" disabled={disabled}
        className="mt-3 rounded-lg border border-zinc-700 px-3 py-2 text-sm disabled:opacity-50"
        aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? "Close asset picker" : "Choose an asset"}
      </button>
      {open && (
        <div className="mt-4 space-y-3 rounded-lg border border-zinc-800 p-4">
          <label htmlFor={selectId} className="block text-sm">Asset type</label>
          <select id={selectId} value={kind} disabled={disabled}
            className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2"
            onChange={(event) => {
              setKind(event.target.value as PlanAssetReference["kind"]);
              setOffset(0);
            }}>
            <option value="audio">Audio files</option>
            <option value="song_revision">Saved song revisions</option>
            <option value="image">Project images</option>
            <option value="video_revision">Saved video revisions</option>
          </select>
          {loading && <p role="status" className="text-sm">Loading assets...</p>}
          {error && (
            <div>
              <p role="alert" className="text-sm text-red-300">{error}</p>
              <button type="button" disabled={disabled}
                className="mt-2 text-sm underline" onClick={() => setRetry((value) => value + 1)}>Retry</button>
            </div>
          )}
          {!loading && page && (
            <>
              {page.items.length === 0 && <p className="text-sm text-zinc-400">No assets on this page.</p>}
              <ul className="space-y-3">
                {page.items.map((asset) => {
                  const linked = assets.some((item) => item.kind === asset.kind && item.id === asset.id);
                  return (
                    <li key={`${asset.kind}:${asset.id}`} className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm">{asset.label}</p>
                        <p className="text-xs text-zinc-500">#{asset.id} ? {new Date(asset.created_at).toLocaleString()}</p>
                      </div>
                      <button type="button" disabled={disabled || linked || assets.length >= 20}
                        className="rounded-lg border border-zinc-700 px-3 py-2 text-sm disabled:opacity-50"
                        onClick={() => link(asset)}>
                        {linked ? "Linked" : context === "task" ? "Link evidence" : "Link to step"}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap gap-4 text-sm">
                <button type="button" disabled={disabled || offset === 0}
                  className="disabled:opacity-40" onClick={() => setOffset((value) => Math.max(0, value - 20))}>
                  Previous
                </button>
                <button type="button" disabled={disabled || !page.has_more}
                  className="disabled:opacity-40" onClick={() => setOffset((value) => value + 20)}>
                  Next
                </button>
                <button type="button" disabled={disabled}
                  onClick={() => setRetry((value) => value + 1)}>Refresh assets</button>
              </div>
            </>
          )}
          {assets.length >= 20 && <p className="text-xs text-amber-200">Maximum 20 links per {context}.</p>}
        </div>
      )}
    </div>
  );
}
