"use client";

import { useEffect, useRef, useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";

type Limits = {
  available: boolean; max_bytes: number; max_source_seconds: number;
  min_clip_seconds: number; max_clip_seconds: number;
};
const control = "rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 disabled:opacity-50";

export default function VideoClipExport({ projectId }: { projectId: number }) {
  const endpoint = `/api/v1/projects/${projectId}/video/clip-export`;
  const [limits, setLimits] = useState<Limits>();
  const [file, setFile] = useState<File>();
  const [source, setSource] = useState("");
  const [duration, setDuration] = useState<number>();
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("");
  const [result, setResult] = useState<{ url: string; start: number; end: number }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewMessage, setPreviewMessage] = useState("");
  const pending = useRef<AbortController | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const previewEnd = useRef<number | null>(null);

  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      await action(controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Video processing failed.");
      }
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const first = Number(start);
  const last = Number(end);
  const rangeValid = Boolean(limits && start.trim() && end.trim() &&
    Number.isFinite(first) && Number.isFinite(last) && first >= 0 &&
    last <= limits.max_source_seconds && (duration === undefined || last <= duration + 0.001) &&
    last - first >= limits.min_clip_seconds - 0.000001 && last - first <= limits.max_clip_seconds + 0.000001);

  return <section className="space-y-4 rounded-2xl border border-zinc-800 bg-black p-6" aria-labelledby="clip-heading">
    <h2 id="clip-heading" className="text-xl font-semibold">Trim and export an MP4</h2>
    <p className="text-zinc-300">Choose a single H.264 MP4, preview a time range and export it with its first audio track. This tool leaves your storyboard and source file unchanged.</p>
    {(!limits || !limits.available) && <button type="button" className={control} disabled={busy}
      onClick={() => void run(async signal => setLimits(await apiFetch<Limits>(endpoint, {signal})))}>
      Check MP4 export availability
    </button>}
    {limits && !limits.available && <p role="status">MP4 export is unavailable on this server. Local setup requires FFmpeg and explicit enablement.</p>}
    {limits?.available && <>
      <p className="text-sm text-zinc-300">Source: up to 32 MB, 120 seconds and 1080p. Export: 0.5–30 seconds, up to 1280 × 720. The source is sent to the local renderer only when you export and is discarded after processing.</p>
      <label className="block">Source MP4
        <input className={`${control} mt-1 block w-full`} type="file" accept="video/mp4,.mp4" disabled={busy}
          onChange={event => {
            const selected = event.target.files?.[0];
            setFile(undefined); setSource(""); setResult(undefined); setDuration(undefined);
            setStart("0"); setEnd(""); setError(""); setPreviewMessage(""); previewEnd.current = null;
            if (!selected) return;
            if (!selected.name.toLowerCase().endsWith(".mp4") || !selected.size || selected.size > limits.max_bytes) {
              setError("Choose a nonempty MP4 file up to 32 MB."); return;
            }
            setFile(selected); setSource(URL.createObjectURL(selected));
          }} />
      </label>
      {source && <video ref={video} src={source} controls preload="metadata" aria-label="Source video preview"
        className="max-h-80 max-w-full"
        onLoadedMetadata={event => {
          const seconds = event.currentTarget.duration;
          if (Number.isFinite(seconds)) {
            setDuration(seconds);
            setEnd(value => value || String(Math.floor(Math.min(seconds, limits.max_clip_seconds) * 1000) / 1000));
          }
        }}
        onTimeUpdate={event => {
          if (previewEnd.current !== null && event.currentTarget.currentTime >= previewEnd.current) {
            event.currentTarget.pause();
            previewEnd.current = null;
          }
        }}
        onPause={() => { previewEnd.current = null; }}
        onError={() => setPreviewMessage("This browser cannot preview the source. You can enter the range manually.")} />}
      {previewMessage && <p role="status">{previewMessage}</p>}
      {file && <form className="space-y-3" onSubmit={event => {
        event.preventDefault();
        if (!rangeValid) return;
        void run(async signal => {
          const clip = await apiDownload(`${endpoint}?start=${first}&end=${last}`, file, "video/mp4", "video/mp4", signal);
          if (!signal.aborted) setResult({url: URL.createObjectURL(clip), start: first, end: last});
        });
      }}>
        <p className="text-sm text-zinc-300">Enter start and end times in seconds{duration !== undefined ? ` (source: ${duration.toFixed(2)} s)` : ""}.</p>
        <div className="flex flex-wrap gap-3">
          <label>Start seconds <input className={`${control} block w-36`} type="number" min="0" step="0.001"
            required value={start} onChange={event => setStart(event.target.value)} disabled={busy} /></label>
          <label>End seconds <input className={`${control} block w-36`} type="number" min="0.001" step="0.001"
            required value={end} onChange={event => setEnd(event.target.value)} disabled={busy} /></label>
        </div>
        {duration !== undefined && duration > limits.max_source_seconds && <p role="alert">Choose a source of 120 seconds or less.</p>}
        {!rangeValid && <p className="text-sm text-zinc-300">Choose a range from 0.5 to 30 seconds within the source.</p>}
        <div className="flex flex-wrap gap-3">
          <button type="button" className={control} disabled={busy || !rangeValid || duration === undefined}
            onClick={() => {
              if (!video.current) return;
              previewEnd.current = last;
              video.current.currentTime = first;
              void video.current.play().catch(() => { setPreviewMessage("Unable to play the selected range."); });
            }}>Preview selected range</button>
          <button type="submit" className={control} disabled={busy || !rangeValid ||
            (duration !== undefined && duration > limits.max_source_seconds)}>Render MP4</button>
        </div>
      </form>}
      {result && <div className="space-y-3">
        <p role="status">MP4 ready for {result.start}–{result.end} seconds.</p>
        <video src={result.url} controls preload="metadata" aria-label="Exported clip preview" className="max-h-80 max-w-full" />
        <a className={`${control} inline-block`} href={result.url} download={`indaverse-${projectId}-clip.mp4`}>Download MP4</a>
      </div>}
    </>}
    {busy && <p role="status">Working…</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
