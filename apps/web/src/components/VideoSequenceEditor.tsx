"use client";

import { useEffect, useRef, useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";

type Cut = { source_id: string; start_ms: number; end_ms: number; title?: string; muted?: boolean; volume_percent?: number; fade_edges?: boolean;
  framing?: "fit" | "fill"; title_position?: "top" | "bottom"; title_duration_ms?: number; caption?: string };
type Preset = "landscape" | "vertical" | "square";
type Source = { id: string; name: string; duration_ms: number };
type SoundtrackSettings = {
  start_ms: number; end_ms: number; offset_ms: number; volume_percent: number;
  fade_in_ms: number; fade_out_ms: number; mode: "mix" | "replace";
};
type Soundtrack = { name: string; duration_ms: number; media_type: string; settings: SoundtrackSettings };
type Sequence = { version: number; clips: Cut[]; sources: Source[]; renderer_available: boolean; soundtrack: Soundtrack | null };
const soundtrackTimes = [
  {key: "start_ms", label: "Audio trim start (seconds)", min: 0},
  {key: "end_ms", label: "Audio trim end (seconds)", min: 0.25},
  {key: "offset_ms", label: "Start in video (seconds)", min: 0, max: 29.999},
  {key: "fade_in_ms", label: "Audio fade in (seconds)", min: 0, max: 5},
  {key: "fade_out_ms", label: "Audio fade out (seconds)", min: 0, max: 5},
] as const;
const control = "rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 disabled:opacity-50";
const seconds = (ms: number) => String(ms / 1000);

export default function VideoSequenceEditor({ projectId }: { projectId: number }) {
  const base = `/api/v1/projects/${projectId}/video/sequence`;
  const [soundtrackSettings, setSoundtrackSettings] = useState<SoundtrackSettings>();
  const [soundtrackPreview, setSoundtrackPreview] = useState<string>();
  const [saved, setSaved] = useState<Sequence>();
  const [clips, setClips] = useState<Cut[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{url: string; name: string; id: string}>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; name: string }>();
  const [preset, setPreset] = useState<Preset>("landscape");
  const [burnCaptions, setBurnCaptions] = useState(false);
  const [subtitleFile, setSubtitleFile] = useState<string>();
  const [previewReady, setPreviewReady] = useState(false);
  const previewPlayer = useRef<HTMLVideoElement>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  useEffect(() => () => { if (subtitleFile) URL.revokeObjectURL(subtitleFile); }, [subtitleFile]);

  useEffect(() => () => { if (soundtrackPreview) URL.revokeObjectURL(soundtrackPreview); }, [soundtrackPreview]);

  function editSoundtrack(change: Partial<SoundtrackSettings>) {
    setSoundtrackSettings(current => current && {...current, ...change});
    setResult(undefined);
  }

  function update(id: string, change: Partial<Cut>) {
    setClips(current => current.map(item => item.source_id === id ? {...item, ...change} : item));
    setResult(undefined);
    setSubtitleFile(undefined);
  }

  function applyPlayhead(key: "start_ms" | "end_ms") {
    if (!preview || !previewPlayer.current) return;
    const clip = clips.find(item => item.source_id === preview.id);
    const source = saved?.sources.find(item => item.id === preview.id);
    if (!clip || !source) return;
    const value = Math.min(source.duration_ms, Math.round(previewPlayer.current.currentTime * 1000));
    const start = key === "start_ms" ? value : clip.start_ms;
    const end = key === "end_ms" ? value : clip.end_ms;
    if (!Number.isFinite(end - start) || start < 0 || end > source.duration_ms || end - start < 500) {
      setError("Choose a playhead position that leaves at least 0.5 seconds in the cut.");
      return;
    }
    update(clip.source_id, {[key]: value});
    setFields(current => ({...current, [`${clip.source_id}-${key}`]: seconds(value)}));
    setError("");
    setNotice(`${key === "start_ms" ? "Start" : "End"} of ${preview.name} set to ${seconds(value)} seconds.`);
  }

  function install(next: Sequence) {
    setSaved(next);
    setSoundtrackSettings(next.soundtrack?.settings);
    setSoundtrackPreview(undefined);
    setClips(next.clips);
    setFields({});
    setPreview(undefined);
    setPreviewReady(false);
    setResult(undefined);
    setSubtitleFile(undefined);
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

  const track = saved?.soundtrack;
  const soundtrackDirty = JSON.stringify(soundtrackSettings) !== JSON.stringify(track?.settings);
  const dirty = saved !== undefined && (JSON.stringify(clips) !== JSON.stringify(saved.clips) || soundtrackDirty);
  const total = clips.reduce((sum, cut) => sum + cut.end_ms - cut.start_ms, 0);
  const invalid = !Number.isFinite(total) || total > 30000 || clips.some(cut => cut.start_ms < 0 ||
    cut.end_ms - cut.start_ms < 500 ||
    cut.end_ms > (saved?.sources.find(source => source.id === cut.source_id)?.duration_ms ?? 0));

  const trackLength = soundtrackSettings ? soundtrackSettings.end_ms - soundtrackSettings.start_ms : 0;
  const invalidTrack = !!soundtrackSettings && (
    !Number.isFinite(trackLength) || trackLength < 250 || soundtrackSettings.start_ms < 0 ||
    soundtrackSettings.end_ms > (track?.duration_ms ?? 0) ||
    !Number.isFinite(soundtrackSettings.offset_ms) || soundtrackSettings.offset_ms < 0 || soundtrackSettings.offset_ms >= 30000 ||
    [soundtrackSettings.fade_in_ms, soundtrackSettings.fade_out_ms].some(value =>
      !Number.isFinite(value) || value < 0 || value > Math.min(5000, trackLength))
  );
  const hasCaptions = clips.some(cut => cut.caption?.trim());
  const timeline = clips.reduce<{start: number; end: number}[]>((ranges, cut) => {
    const start = ranges.at(-1)?.end ?? 0;
    ranges.push({start, end: start + cut.end_ms - cut.start_ms});
    return ranges;
  }, []);

  function move(index: number, to: number) {
    setClips(current => {
      const next = [...current];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
    setResult(undefined);
    setSubtitleFile(undefined);
  }

  return <section className="space-y-4 rounded-2xl border border-zinc-800 bg-black p-6" aria-labelledby="sequence-heading">
    <h2 id="sequence-heading" className="text-xl font-semibold">Saved clip sequence</h2>
    <p className="text-zinc-300">Arrange up to four MP4 clips and save their cut points. Export as landscape, vertical or square video. Add titles, captions and audio effects to individual clips. Source previews play the original file.</p>
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
      {!invalid && clips.length > 0 && <section aria-labelledby="sequence-timing" className="space-y-2">
        <h3 id="sequence-timing" className="font-semibold">Output timeline</h3>
        <div className="flex h-2 gap-1" aria-hidden="true">
          {clips.map((cut, index) => <span key={cut.source_id} className={index % 2 ? "rounded bg-amber-400" : "rounded bg-sky-400"}
            style={{flex: cut.end_ms - cut.start_ms}} />)}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {clips.map((cut, index) => <a key={cut.source_id} href={`#sequence-clip-${cut.source_id}`} className="underline">
            Clip {index + 1}: {seconds(timeline[index].start)}–{seconds(timeline[index].end)} s
          </a>)}
        </div>
      </section>}
      <ol className="space-y-3">
        {clips.map((cut, index) => {
          const source = saved.sources.find(item => item.id === cut.source_id);
          return <li key={cut.source_id} id={`sequence-clip-${cut.source_id}`} className="space-y-2 rounded border border-zinc-800 p-3">
            <h3 className="break-words font-semibold">{index + 1}. {source?.name}</h3>
            <p className="text-sm text-zinc-300">Source: {seconds(source?.duration_ms ?? 0)} seconds</p>
            <div className="flex flex-wrap gap-2">
              {(["start_ms", "end_ms"] as const).map(key => <label key={key}>{key === "start_ms" ? "Start" : "End"} seconds
                <input type="number" min="0" step="0.001" className={`${control} block w-32`} disabled={busy}
                  value={fields[`${cut.source_id}-${key}`] ?? seconds(cut[key])} onChange={event => {
                    const raw = event.target.value;
                    setFields(current => ({...current, [`${cut.source_id}-${key}`]: raw}));
                    const value = Math.round(event.target.valueAsNumber * 1000);
                    update(cut.source_id, {[key]: value});
                  }} />
              </label>)}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-0 max-w-full">Clip title (optional)
                <input type="text" maxLength={48} className={`${control} block w-64 max-w-full`}
                  disabled={busy} value={cut.title ?? ""} onChange={event => {
                    const title = event.target.value;
                    update(cut.source_id, {title});
                  }} />
              </label>
              <label>Framing
                <select className={`${control} block`} disabled={busy} value={cut.framing ?? "fit"}
                  onChange={event => update(cut.source_id, {framing: event.target.value === "fill" ? "fill" : "fit"})}>
                  <option value="fit">Fit (keep entire picture)</option>
                  <option value="fill">Fill (crop centre)</option>
                </select>
              </label>
              <label>Title position
                <select className={`${control} block`} disabled={busy || !cut.title} value={cut.title_position ?? "bottom"}
                  onChange={event => update(cut.source_id, {title_position: event.target.value === "top" ? "top" : "bottom"})}>
                  <option value="bottom">Bottom</option>
                  <option value="top">Top</option>
                </select>
              </label>
              <label>Show title
                <select className={`${control} block`} disabled={busy || !cut.title} value={cut.title_duration_ms ?? 0}
                  onChange={event => update(cut.source_id, {title_duration_ms: Number(event.target.value)})}>
                  <option value={0}>Entire cut</option>
                  <option value={500}>First 0.5 seconds</option>
                  <option value={1000}>First second</option>
                  <option value={2000}>First two seconds</option>
                  {cut.title_duration_ms && ![500, 1000, 2000].includes(cut.title_duration_ms) ?
                    <option value={cut.title_duration_ms}>First {seconds(cut.title_duration_ms)} seconds</option> : null}
                </select>
              </label>
              <label className="block min-w-0 max-w-full">Caption (optional, entire cut)
                <input type="text" maxLength={90} className={`${control} block w-72 max-w-full`} disabled={busy}
                  value={cut.caption ?? ""} onChange={event => update(cut.source_id, {caption: event.target.value})} />
              </label>
              <label className="flex items-center gap-2 py-2">
                <input type="checkbox" disabled={busy} checked={cut.muted ?? false} onChange={event => {
                  const muted = event.target.checked;
                  update(cut.source_id, {muted});
                }} />
                Mute clip audio
              </label>
              <label className="block">
                Clip volume ({cut.volume_percent ?? 100}%)
                <input type="range" min={0} max={100} step={1} aria-label="Clip volume"
                  className="block w-36" disabled={busy || cut.muted} value={cut.volume_percent ?? 100}
                  onChange={event => {
                    const volume_percent = event.target.valueAsNumber;
                    update(cut.source_id, {volume_percent});
                  }} />
              </label>
              <label className="flex items-center gap-2 py-2">
                <input type="checkbox" disabled={busy} checked={cut.fade_edges ?? false} onChange={event => {
                  const fade_edges = event.target.checked;
                  update(cut.source_id, {fade_edges});
                }} />
                Fade picture and audio (0.25 s at each end)
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={control} disabled={busy} onClick={() => void run(async signal => {
                const file = await apiDownload(`${base}/sources/${cut.source_id}`, undefined, "application/octet-stream", "video/mp4", signal);
                if (!signal.aborted) {
                  setPreviewReady(false);
                  setPreview({url: URL.createObjectURL(file), name: source?.name ?? "Source MP4", id: cut.source_id});
                }
              })}>Preview source</button>
              <button type="button" className={control} disabled={busy || index === 0} onClick={() => move(index, index - 1)}>Move earlier</button>
              <button type="button" className={control} disabled={busy || index === clips.length - 1} onClick={() => move(index, index + 1)}>Move later</button>
              <button type="button" className={control} disabled={busy} onClick={() => {
                setClips(current => current.filter(item => item.source_id !== cut.source_id));
                if (preview?.id === cut.source_id) setPreview(undefined);
                setResult(undefined);
                setSubtitleFile(undefined);
              }}>Remove clip</button>
            </div>
          </li>;
        })}
      </ol>
      <p>Sequence: {Number.isFinite(total) ? `${seconds(total)} seconds` : "invalid duration"} · {dirty ? "Unsaved changes" : `Saved version ${saved.version}`}</p>
      {invalid && <p role="alert">Use cuts of at least 0.5 seconds within each source and a total of at most 30 seconds.</p>}
      <fieldset className="space-y-3 rounded border border-zinc-700 p-3" disabled={busy}>
        <legend className="px-1 font-semibold">Soundtrack</legend>
        <p className="text-sm text-zinc-300">Attach one MP3 or PCM WAV (up to 8 MiB and 120 seconds). The file is saved privately with this sequence.</p>
        <label className="block">{track ? "Replace soundtrack file" : "Add soundtrack file"}
          <input type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" className={`${control} mt-1 block w-full`}
            disabled={dirty || !clips.length || !saved.renderer_available}
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              const format = file.name.toLowerCase().split(".").at(-1);
              if (!file.size || file.size > 8 * 1024 * 1024 || (format !== "mp3" && format !== "wav")) {
                setError("Choose a nonempty MP3 or WAV up to 8 MiB.");
                return;
              }
              if (track && !window.confirm("Replace the saved soundtrack and reset its trim and mix settings?")) return;
              const name = Array.from(file.name).slice(0, 146).join("");
              const filename = name.toLowerCase().endsWith(`.${format}`) ? name : `${name}.${format}`;
              const mediaType = format === "mp3" ? "audio/mpeg" : "audio/wav";
              void run(async signal => {
                install(await apiFetch<Sequence>(`${base}/soundtrack?version=${saved.version}`, {
                  method: "POST", headers: {"X-Audio-Filename": encodeURIComponent(filename)},
                  rawBody: file.slice(0, file.size, mediaType), signal,
                }));
                setNotice(track ? "Soundtrack replaced." : "Soundtrack added and saved.");
              });
            }} />
        </label>
        {!clips.length && <p className="text-sm">Add a video clip to attach a soundtrack.</p>}
        {track && soundtrackSettings && <>
          <p className="break-words">{track.name} · {seconds(track.duration_ms)} seconds</p>
          <div className="flex flex-wrap gap-3">
            {soundtrackTimes.map(field => <label key={field.key}>{field.label}
              <input type="number" className={`${control} block w-36`} min={field.min}
                max={"max" in field ? field.max : track.duration_ms / 1000} step="0.001"
                value={Number.isFinite(soundtrackSettings[field.key]) ? seconds(soundtrackSettings[field.key]) : ""}
                onChange={event => editSoundtrack({[field.key]: Math.round(event.target.valueAsNumber * 1000)})} />
            </label>)}
            <label>Soundtrack volume ({soundtrackSettings.volume_percent}%)
              <input type="range" aria-label="Soundtrack volume" min={0} max={100} className="block w-36"
                value={soundtrackSettings.volume_percent}
                onChange={event => editSoundtrack({volume_percent: event.target.valueAsNumber})} />
            </label>
            <label>Clip audio
              <select className={`${control} block`} value={soundtrackSettings.mode}
                onChange={event => editSoundtrack({mode: event.target.value === "replace" ? "replace" : "mix"})}>
                <option value="mix">Mix with original clip audio</option>
                <option value="replace">Replace original clip audio</option>
              </select>
            </label>
          </div>
          <p className="text-sm text-zinc-300">Audio stops at the end of the video. Replace silences the original clips across the whole video.</p>
          {invalidTrack && <p role="alert">Use at least 0.25 seconds within the audio source, an offset below 30 seconds, and fades within the cut and no longer than 5 seconds each.</p>}
          {!invalidTrack && !invalid && total > 0 && soundtrackSettings.offset_ms >= total &&
            <p role="status">The soundtrack starts after the video ends. Move its start earlier to hear it.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={control} onClick={() => void run(async signal => {
              const file = await apiDownload(`${base}/soundtrack?version=${saved.version}`, undefined,
                "application/octet-stream", track.media_type, signal);
              if (!signal.aborted) setSoundtrackPreview(URL.createObjectURL(file));
            })}>Preview soundtrack source</button>
            <button type="button" className={control} disabled={dirty} onClick={() => {
              if (!window.confirm("Remove the saved soundtrack from this sequence?")) return;
              void run(async signal => {
                install(await apiFetch<Sequence>(`${base}/soundtrack?version=${saved.version}`, {method: "DELETE", signal}));
                setNotice("Soundtrack removed.");
              });
            }}>Remove soundtrack</button>
          </div>
          {soundtrackPreview && <audio controls className="max-w-full" preload="metadata"
            aria-label="Original soundtrack preview" src={soundtrackPreview} />}
        </>}
      </fieldset>
      <fieldset className="space-y-2 rounded border border-zinc-700 p-3" disabled={busy}>
        <legend className="px-1 font-semibold">Export settings</legend>
        <label>Video format
          <select className={`${control} block`} value={preset} onChange={event => {
            const value = event.target.value;
            setPreset(value === "vertical" || value === "square" ? value : "landscape");
            setResult(undefined);
          }}>
            <option value="landscape">Landscape · 640 × 360</option>
            <option value="vertical">Vertical · 360 × 640</option>
            <option value="square">Square · 480 × 480</option>
          </select>
        </label>
        <label className="flex gap-2">
          <input type="checkbox" disabled={!hasCaptions} checked={hasCaptions && burnCaptions}
            onChange={event => { setBurnCaptions(event.target.checked); setResult(undefined); }} />
          Show captions in the video
        </label>
        <p className="text-sm text-zinc-300">These choices apply to the next render. SRT is a separate subtitle file.</p>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={control} disabled={busy || !dirty || invalid || invalidTrack} onClick={() => {
          if (clips.length < saved.clips.length && !window.confirm("Remove the selected clips and their saved source files?")) return;
          void run(async signal => {
            install(await apiFetch<Sequence>(base, {method: "PUT", body: {version: saved.version, clips, soundtrack_settings: soundtrackDirty ? soundtrackSettings : undefined}, signal}));
            setNotice("Sequence saved.");
          });
        }}>Save sequence</button>
        <button type="button" className={control}
          disabled={busy || dirty || invalid || !clips.length || !saved.renderer_available}
          onClick={() => void run(async signal => {
            const file = await apiDownload(`${base}/render?version=${saved.version}&preset=${preset}&burn_captions=${hasCaptions && burnCaptions}`, new Blob(), "application/octet-stream", "video/mp4", signal);
            if (!signal.aborted) setResult({url: URL.createObjectURL(file), name: `indaverse-${projectId}-sequence.mp4`});
          })}>Render saved sequence</button>
        <button type="button" className={control} disabled={busy || dirty || !hasCaptions}
          onClick={() => void run(async signal => {
            const file = await apiDownload(`${base}/captions.srt?version=${saved.version}`, undefined, "application/x-subrip", "application/x-subrip", signal);
            if (!signal.aborted) setSubtitleFile(URL.createObjectURL(file));
          })}>Prepare captions SRT</button>
        {subtitleFile && <a className={control} href={subtitleFile} download={`indaverse-${projectId}-captions.srt`}>Download captions SRT</a>}
      </div>
    </>}
    {preview && <div className="space-y-2">
      <p>Full source: {preview.name}</p>
      <video key={preview.url} ref={previewPlayer} className="max-h-80 max-w-full" src={preview.url} controls preload="metadata"
        aria-label="Saved source preview" onLoadedMetadata={() => setPreviewReady(true)} />
      <p className="text-sm text-zinc-300">Seek or pause the preview, then use that position as a cut point.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={control} disabled={busy || !previewReady} onClick={() => applyPlayhead("start_ms")}>Set start from playhead</button>
        <button type="button" className={control} disabled={busy || !previewReady} onClick={() => applyPlayhead("end_ms")}>Set end from playhead</button>
      </div>
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
