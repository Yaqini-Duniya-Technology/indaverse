"use client";

import { useEffect, useRef, useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";

type Cut = { source_id: string; start_ms: number; end_ms: number; title?: string; muted?: boolean; volume_percent?: number; fade_edges?: boolean };
type Source = { id: string; name: string; duration_ms: number };
type Sequence = { version: number; clips: Cut[]; sources: Source[]; renderer_available: boolean };
const control = "rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 disabled:opacity-50";
const seconds = (ms: number) => String(ms / 1000);

export default function VideoSequenceEditor({ projectId }: { projectId: number }) {
  const base = `/api/v1/projects/${projectId}/video/sequence`;
  const [saved, setSaved] = useState<Sequence>();
  const [clips, setClips] = useState<Cut[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{url: string; name: string}>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; name: string }>();
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  function install(next: Sequence) {
    setSaved(next);
    setClips(next.clips);
    setFields({});
    setPreview(undefined);
    setResult(undefined);
  }

  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError(""); setNotice("");
    try {
      await action(controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The sequence operation failed.");
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const dirty = saved !== undefined && JSON.stringify(clips) !== JSON.stringify(saved.clips);
  const total = clips.reduce((sum, cut) => sum + cut.end_ms - cut.start_ms, 0);
  const invalid = !Number.isFinite(total) || total > 30000 || clips.some(cut => cut.start_ms < 0 ||
    cut.end_ms - cut.start_ms < 500 ||
    cut.end_ms > (saved?.sources.find(source => source.id === cut.source_id)?.duration_ms ?? 0));

  function move(index: number, to: number) {
    setClips(current => {
      const next = [...current];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
    setResult(undefined);
  }

  return <section className="space-y-4 rounded-2xl border border-zinc-800 bg-black p-6" aria-labelledby="sequence-heading">
    <h2 id="sequence-heading" className="text-xl font-semibold">Saved clip sequence</h2>
    <p className="text-zinc-300">Arrange up to four MP4 clips and save their cut points. Export joins the cuts at 640 × 360 and applies each clip’s title, volume, mute and fades. Source previews play the original file.</p>
    <button type="button" className={control} disabled={busy} onClick={() => {
      if (dirty && !window.confirm("Discard unsaved sequence edits and reload?")) return;
      void run(async signal => install(await apiFetch<Sequence>(base, {signal})));
    }}>{saved ? "Reload saved sequence" : "Open clip sequence"}</button>
    {saved && <>
      {!saved.renderer_available && <p role="status">Enable local FFmpeg processing to add clips or render.</p>}
      <label className="block">Add source MP4 (8 MiB per file)
        <input type="file" accept="video/mp4,.mp4" className={`${control} mt-1 block w-full`}
          disabled={busy || dirty || !saved.renderer_available || clips.length >= 4}
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (!file.name.toLowerCase().endsWith(".mp4") || !file.size || file.size > 8 * 1024 * 1024) {
              setError("Choose a nonempty MP4 up to 8 MiB."); return;
            }
            const name = encodeURIComponent(Array.from(file.name).slice(0, 150).join(""));
            void run(async signal => {
              install(await apiFetch<Sequence>(`${base}/sources?version=${saved.version}`, {
                method: "POST", headers: {"X-Video-Filename": name}, rawBody: file.slice(0, file.size, "video/mp4"), signal,
              }));
              setNotice("Source added and saved.");
            });
          }} />
      </label>
      <p className="text-sm text-zinc-300">Adding a source saves it to this project. Removing a clip deletes its saved source when you save the sequence. Save other edits before adding a clip.</p>
      <ol className="space-y-3">
        {clips.map((cut, index) => {
          const source = saved.sources.find(item => item.id === cut.source_id);
          return <li key={cut.source_id} className="space-y-2 rounded border border-zinc-800 p-3">
            <h3 className="break-words font-semibold">{index + 1}. {source?.name}</h3>
            <p className="text-sm text-zinc-300">Source: {seconds(source?.duration_ms ?? 0)} seconds</p>
            <div className="flex flex-wrap gap-2">
              {(["start_ms", "end_ms"] as const).map(key => <label key={key}>{key === "start_ms" ? "Start" : "End"} seconds
                <input type="number" min="0" step="0.001" className={`${control} block w-32`} disabled={busy}
                  value={fields[`${cut.source_id}-${key}`] ?? seconds(cut[key])} onChange={event => {
                    const raw = event.target.value;
                    setFields(current => ({...current, [`${cut.source_id}-${key}`]: raw}));
                    const value = Math.round(event.target.valueAsNumber * 1000);
                    setClips(current => current.map(item => item.source_id === cut.source_id ? {...item, [key]: value} : item));
                    setResult(undefined);
                  }} />
              </label>)}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-0 max-w-full">Clip title (optional)
                <input type="text" maxLength={48} className={`${control} block w-64 max-w-full`}
                  disabled={busy} value={cut.title ?? ""} onChange={event => {
                    const title = event.target.value;
                    setClips(current => current.map(item => item.source_id === cut.source_id ? {...item, title} : item));
                    setResult(undefined);
                  }} />
              </label>
              <label className="flex items-center gap-2 py-2">
                <input type="checkbox" disabled={busy} checked={cut.muted ?? false} onChange={event => {
                  const muted = event.target.checked;
                  setClips(current => current.map(item => item.source_id === cut.source_id ? {...item, muted} : item));
                  setResult(undefined);
                }} />
                Mute clip audio
              </label>
              <label className="block">
                Clip volume ({cut.volume_percent ?? 100}%)
                <input type="range" min={0} max={100} step={1} aria-label="Clip volume"
                  className="block w-36" disabled={busy || cut.muted} value={cut.volume_percent ?? 100}
                  onChange={event => {
                    const volume_percent = event.target.valueAsNumber;
                    setClips(current => current.map(item => item.source_id === cut.source_id ? {...item, volume_percent} : item));
                    setResult(undefined);
                  }} />
              </label>
              <label className="flex items-center gap-2 py-2">
                <input type="checkbox" disabled={busy} checked={cut.fade_edges ?? false} onChange={event => {
                  const fade_edges = event.target.checked;
                  setClips(current => current.map(item => item.source_id === cut.source_id ? {...item, fade_edges} : item));
                  setResult(undefined);
                }} />
                Fade picture and audio (0.25 s at each end)
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={control} disabled={busy} onClick={() => void run(async signal => {
                const file = await apiDownload(`${base}/sources/${cut.source_id}`, undefined, "application/octet-stream", "video/mp4", signal);
                if (!signal.aborted) setPreview({url: URL.createObjectURL(file), name: source?.name ?? "Source MP4"});
              })}>Preview source</button>
              <button type="button" className={control} disabled={busy || index === 0} onClick={() => move(index, index - 1)}>Move earlier</button>
              <button type="button" className={control} disabled={busy || index === clips.length - 1} onClick={() => move(index, index + 1)}>Move later</button>
              <button type="button" className={control} disabled={busy} onClick={() => {
                setClips(current => current.filter(item => item.source_id !== cut.source_id));
                setResult(undefined);
              }}>Remove clip</button>
            </div>
          </li>;
        })}
      </ol>
      <p>Sequence: {Number.isFinite(total) ? `${seconds(total)} seconds` : "invalid duration"} · {dirty ? "Unsaved changes" : `Saved version ${saved.version}`}</p>
      {invalid && <p role="alert">Use cuts of at least 0.5 seconds within each source and a total of at most 30 seconds.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={control} disabled={busy || !dirty || invalid} onClick={() => {
          if (clips.length < saved.clips.length && !window.confirm("Remove the selected clips and their saved source files?")) return;
          void run(async signal => {
            install(await apiFetch<Sequence>(base, {method: "PUT", body: {version: saved.version, clips}, signal}));
            setNotice("Sequence saved.");
          });
        }}>Save sequence</button>
        <button type="button" className={control}
          disabled={busy || dirty || invalid || !clips.length || !saved.renderer_available}
          onClick={() => void run(async signal => {
            const file = await apiDownload(`${base}/render?version=${saved.version}`, new Blob(), "application/octet-stream", "video/mp4", signal);
            if (!signal.aborted) setResult({url: URL.createObjectURL(file), name: `indaverse-${projectId}-sequence.mp4`});
          })}>Render saved sequence</button>
      </div>
    </>}
    {preview && <div className="space-y-2">
      <p>Full source: {preview.name}</p>
      <video className="max-h-80 max-w-full" src={preview.url} controls preload="metadata" aria-label="Saved source preview" />
    </div>}
    {result && <div className="space-y-2">
      <video className="max-h-80 max-w-full" src={result.url} controls preload="metadata" aria-label="Rendered sequence preview" />
      <a className={`${control} inline-block`} href={result.url} download={result.name}>Download sequence MP4</a>
    </div>}
    {busy && <p role="status">Working…</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
