"use client";

import { useEffect, useState } from "react";
import ProjectImage from "@/components/ProjectImage";
import { ApiError } from "@/lib/api";
import {
  getPlanAssetDetail, type PlanAssetDetail, type PlanAssetReference,
} from "@/lib/projectPlan";

const lyricFields = [
  ["Intro", "lyrics_intro"],
  ["Verse 1", "lyrics_verse_1"],
  ["Chorus", "lyrics_chorus"],
  ["Verse 2", "lyrics_verse_2"],
  ["Bridge", "lyrics_bridge"],
  ["Outro", "lyrics_outro"],
] as const;

function textValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value
    : typeof value === "number" ? String(value) : fallback;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default function LinkedAssetPreview({
  projectId, asset,
}: {
  projectId: number;
  asset: PlanAssetReference;
}) {
  return <AssetPreview key={`${projectId}:${asset.kind}:${asset.id}`}
    projectId={projectId} asset={asset} />;
}

function AssetPreview({ projectId, asset }: {
  projectId: number; asset: PlanAssetReference;
}) {
  const [detail, setDetail] = useState<PlanAssetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const [playbackError, setPlaybackError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setDetail(null);
    setMissing(false);
    setError("");
    setOpen(false);
    setPlaybackError("");
    void getPlanAssetDetail(projectId, asset).then((result) => {
      if (active) setDetail(result);
    }).catch((err: unknown) => {
      if (!active) return;
      if (err instanceof ApiError && err.status === 404) setMissing(true);
      else setError(err instanceof Error ? err.message : "Unable to check this asset.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [projectId, asset.kind, asset.id, retry]);

  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
  const contentUrl = `${apiUrl}/api/v1/projects/${projectId}/audio/${asset.id}/content`;
  const labels = {
    audio: "Audio", song_revision: "Song revision",
    image: "Project image", video_revision: "Video revision",
  };
  const snapshot = detail?.snapshot;
  const shots = Array.isArray(snapshot?.shots) ? snapshot.shots.filter(isRecord) : [];

  return (
    <div className="min-w-0 flex-1">
      <p className="break-words">{detail?.label || `${labels[asset.kind]} #${asset.id}`}</p>
      {loading && <p role="status" className="mt-1 text-xs text-zinc-400">Checking linked asset...</p>}
      {missing && <p role="status" className="mt-1 text-xs text-amber-200">
        This asset is no longer available. You can remove its link.
      </p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-300">{error}</p>}
      {detail && <p className="mt-1 text-xs text-zinc-400">
        Saved {new Date(detail.created_at).toLocaleString()}
        {detail.file_size !== null && ` | ${(detail.file_size / 1024 / 1024).toFixed(2)} MB`}
      </p>}
      {detail && !detail.available && <p role="status" className="mt-1 text-xs text-amber-200">
        The asset record exists, but its stored file is missing.
      </p>}
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {detail?.available && <button type="button" aria-expanded={open}
          className="text-violet-300 underline" onClick={() => {
            setOpen((value) => !value); setPlaybackError("");
          }}>{open ? "Close preview" : "Preview"}</button>}
        <button type="button" disabled={loading}
          className="text-zinc-400 underline disabled:opacity-50"
          onClick={() => setRetry((value) => value + 1)}>
          {error ? "Retry" : "Refresh asset"}
        </button>
      </div>
      {open && detail?.available && (
        <div className="mt-3 rounded-lg border border-zinc-800 p-3">
          {asset.kind === "audio" ? (
            <>
              <audio controls preload="none" crossOrigin="use-credentials"
                src={contentUrl} className="w-full" aria-label={`Preview ${detail.label}`}
                onError={() => setPlaybackError(
                  "Unable to play this recording. Refresh the asset, check your sign-in, or try Music Studio.",
                )} />
              {playbackError && <p role="alert" className="mt-2 text-xs text-red-300">{playbackError}</p>}
            </>
          ) : asset.kind === "image" ? (
            <ProjectImage projectId={projectId} imageId={asset.id} alt={detail.label}
              className="h-64 w-full rounded-lg object-contain" />
          ) : asset.kind === "video_revision" ? (
            <>
              <p className="font-medium">{textValue(snapshot?.title, "Untitled video")}</p>
              <p className="mt-2 text-xs text-zinc-400">
                {textValue(snapshot?.aspect_ratio, "Frame format not set")} / {shots.length} saved shots
              </p>
              <h4 className="mt-4 text-sm font-medium">Saved script</h4>
              <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm">
                {textValue(snapshot?.script, "No script saved.")}
              </p>
              <ol className="mt-4 max-h-96 space-y-4 overflow-auto">
                {shots.map((shot, index) => (
                  <li key={`${textValue(shot.id, "shot")}:${index}`}
                    className="rounded-lg border border-zinc-800 p-3">
                    <p className="break-words text-sm font-medium">
                      {index + 1}. {textValue(shot.title, "Untitled shot")} / {textValue(shot.duration_seconds, "?")}s
                    </p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-400">
                      {textValue(shot.description, "No visual description.")}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-xs text-zinc-400">
                      Camera: {textValue(shot.camera_direction, "Not set")}
                    </p>
                    {typeof shot.image_id === "number" && Number.isSafeInteger(shot.image_id) && shot.image_id > 0 &&
                      <ProjectImage projectId={projectId} imageId={shot.image_id}
                        alt={`Reference for ${textValue(shot.title, "saved shot")}`}
                        className="mt-3 h-40 w-full rounded-lg object-contain" />}
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-xs text-zinc-500">Saved revision preview. Your video draft is unchanged.</p>
            </>
          ) : (
            <>
              <p className="font-medium">{textValue(snapshot?.title, "Untitled song")}</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                {(["artist", "genre", "mood", "bpm"] as const).map((field) => (
                  <div key={field}><dt className="capitalize text-zinc-500">{field}</dt>
                    <dd className="mt-1">{textValue(snapshot?.[field], "Not set")}</dd>
                  </div>
                ))}
              </dl>
              {lyricFields.map(([title, field]) => (
                <div key={field} className="mt-4">
                  <p className="text-xs font-medium text-zinc-400">{title}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                    {textValue(snapshot?.[field], "No lyrics saved.")}
                  </p>
                </div>
              ))}
              <p className="mt-4 text-xs text-zinc-500">Saved revision preview. Your song draft is unchanged.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
