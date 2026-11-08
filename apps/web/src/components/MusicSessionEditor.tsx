"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { API_URL, type UploadedAudio } from "@/lib/music";

type Region = {start_ms: number; end_ms: number; offset_ms: number; fade_in_ms: number; fade_out_ms: number};
type Track = {asset_id: number; duration_ms: number; volume: number; mute: boolean; solo: boolean; regions: Region[]};
type Lyric = {name: string; text: string; start_ms: number | null; end_ms: number | null};
type Arrangement = {tracks: Track[]; lyrics: Lyric[]};
type Session = {version: number; data: Arrangement};
type Decoded = {buffer: AudioBuffer; peaks: number[]};
const control = "rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm disabled:opacity-50";
const limit = 12 * 1024 * 1024;
const length = (region: Region) => region.end_ms - region.start_ms;
const seconds = (ms: number) => Number.isFinite(ms) ? String(ms / 1000) : "";
const regionFields = [
  ["start_ms", "Source start"], ["end_ms", "Source end"], ["offset_ms", "Timeline start"],
  ["fade_in_ms", "Fade in"], ["fade_out_ms", "Fade out"],
] as const;

async function checkDuration(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const element = new Audio();
  try {
    return await new Promise<number>((resolve, reject) => {
      const failure = () => reject(new Error("This browser could not read the audio metadata."));
      const timer = window.setTimeout(failure, 8000);
      element.onloadedmetadata = () => {
        window.clearTimeout(timer);
        if (!Number.isFinite(element.duration) || element.duration < 0.1 || element.duration > 300) {
          reject(new Error("Use audio between 0.1 seconds and five minutes."));
        } else resolve(element.duration);
      };
      element.onerror = () => { window.clearTimeout(timer); failure(); };
      element.preload = "metadata";
      element.src = url;
    });
  } finally {
    element.removeAttribute("src");
    element.load();
    URL.revokeObjectURL(url);
  }
}

function waveform(buffer: AudioBuffer) {
  const channels = Array.from({length: buffer.numberOfChannels}, (_, channel) => buffer.getChannelData(channel));
  return Array.from({length: 128}, (_, bin) => {
    const start = Math.floor(bin * buffer.length / 128);
    const end = Math.floor((bin + 1) * buffer.length / 128);
    let peak = 0;
    for (const channel of channels) {
      for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(channel[i]));
    }
    return Math.min(1, peak);
  });
}

export default function MusicSessionEditor({projectId, assets}: {projectId: number; assets: UploadedAudio[]}) {
  const base = `/api/v1/projects/${projectId}/music/session`;
  const [saved, setSaved] = useState<Session>();
  const [data, setData] = useState<Arrangement>({tracks: [], lyrics: []});
  const [assetId, setAssetId] = useState("");
  const [peaks, setPeaks] = useState<Record<number, number[]>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [position, setPosition] = useState<number>();
  const audio = useRef<AudioContext>(null);
  const decoded = useRef(new Map<number, Decoded>());
  const active = useRef<AudioBufferSourceNode[]>([]);
  const clock = useRef<number>(undefined);
  const pending = useRef<AbortController>(null);
  const dirty = !!saved && JSON.stringify(data) !== JSON.stringify(saved.data);
  const duration = Math.max(0, ...data.tracks.flatMap(track => track.regions.map(region => region.offset_ms + length(region))));
  const available = assets.filter(asset => asset.file_size <= limit && !data.tracks.some(track => track.asset_id === asset.id));

  useEffect(() => {
    const cache = decoded.current;
    return () => {
      pending.current?.abort();
      window.clearInterval(clock.current);
      for (const source of active.current) { source.stop(); source.disconnect(); }
      if (audio.current) void audio.current.close();
      cache.clear();
    };
  }, []);

  function context() {
    return audio.current ??= new AudioContext({sampleRate: 24000});
  }

  function stop() {
    for (const source of active.current) { source.stop(); source.disconnect(); }
    active.current = [];
    window.clearInterval(clock.current);
    setPosition(undefined);
  }

  function change(next: Arrangement) {
    stop();
    setData(next);
    setMessage("");
  }

  async function run(task: (signal: AbortSignal) => Promise<void>) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError(""); setMessage("");
    try { await task(controller.signal); }
    catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not complete the music session action.");
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function loadBuffer(asset: UploadedAudio | undefined, signal: AbortSignal) {
    if (!asset || asset.file_size > limit) throw new Error("This source is missing or exceeds 12 MiB.");
    const cached = decoded.current.get(asset.id);
    if (cached) return cached;
    const ctx = context();
    const response = await fetch(`${API_URL}/api/v1/projects/${projectId}/audio/${asset.id}/content`, {
      credentials: "include", signal,
    });
    if (!response.ok) throw new Error("Could not open the private audio source.");
    const blob = await response.blob();
    if (!blob.size || blob.size > limit) throw new Error("This source is empty or exceeds 12 MiB.");
    await checkDuration(blob);
    signal.throwIfAborted();
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    signal.throwIfAborted();
    if (buffer.duration < 0.1 || buffer.duration > 300 || buffer.numberOfChannels > 2) {
      throw new Error("Use mono or stereo audio up to five minutes.");
    }
    const result = {buffer, peaks: waveform(buffer)};
    if (decoded.current.size >= 4) {
      const oldest = decoded.current.keys().next().value;
      if (oldest !== undefined) decoded.current.delete(oldest);
    }
    decoded.current.set(asset.id, result);
    setPeaks(current => ({...current, [asset.id]: result.peaks}));
    return result;
  }

  function updateTrack(index: number, patch: Partial<Track>) {
    change({...data, tracks: data.tracks.map((track, i) => i === index ? {...track, ...patch} : track)});
  }

  function play() {
    void run(async signal => {
      stop();
      const ctx = context();
      await ctx.resume();
      const solo = data.tracks.some(track => track.solo && !track.mute);
      const playing = data.tracks.filter(track => !track.mute && track.volume > 0 && (!solo || track.solo));
      if (!playing.length) throw new Error("Unmute a track or turn up its volume.");
      const tracks = [];
      for (const track of playing) {
        const {buffer} = await loadBuffer(assets.find(asset => asset.id === track.asset_id), signal);
        let previous = 0;
        for (const region of [...track.regions].sort((a, b) => a.offset_ms - b.offset_ms)) {
          if (Object.values(region).some(value => !Number.isSafeInteger(value) || value < 0) ||
              length(region) < 100 || region.end_ms > Math.round(buffer.duration * 1000) ||
              region.fade_in_ms > 10000 || region.fade_out_ms > 10000 ||
              region.fade_in_ms + region.fade_out_ms > length(region) ||
              region.offset_ms < previous || region.offset_ms + length(region) > 600000) {
            throw new Error("Check trim, placement and fades before previewing.");
          }
          previous = region.offset_ms + length(region);
        }
        tracks.push({track, buffer});
      }
      signal.throwIfAborted();
      const when = ctx.currentTime + 0.08;
      let endMs = 0;
      for (const {track, buffer} of tracks) {
        for (const region of track.regions) {
          const source = ctx.createBufferSource();
          const gain = ctx.createGain();
          source.buffer = buffer;
          source.connect(gain).connect(ctx.destination);
          source.onended = () => { source.disconnect(); gain.disconnect(); };
          const start = when + region.offset_ms / 1000;
          const end = start + length(region) / 1000;
          const level = track.volume / 100 / tracks.length;
          gain.gain.setValueAtTime(region.fade_in_ms ? 0 : level, start);
          if (region.fade_in_ms) gain.gain.linearRampToValueAtTime(level, start + region.fade_in_ms / 1000);
          if (region.fade_out_ms) {
            gain.gain.setValueAtTime(level, end - region.fade_out_ms / 1000);
            gain.gain.linearRampToValueAtTime(0, end);
          }
          source.start(start, region.start_ms / 1000, length(region) / 1000);
          active.current.push(source);
          endMs = Math.max(endMs, region.offset_ms + length(region));
        }
      }
      setPosition(0);
      clock.current = window.setInterval(() => {
        const elapsed = Math.max(0, (ctx.currentTime - when) * 1000);
        if (elapsed >= endMs) stop();
        else setPosition(Math.floor(elapsed));
      }, 100);
    });
  }

  return <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-6" aria-label="Music session">
    <h2 className="text-xl font-semibold">Music session</h2>
    <p className="text-sm text-zinc-300">Arrange up to four private audio files from the Audio Library below. Edits are saved separately from the song sheet and original files.</p>
    <fieldset disabled={busy} className="space-y-3">
      <button type="button" className={control} onClick={() => {
        if (dirty && !window.confirm("Discard unsaved session edits and reload?")) return;
        void run(async signal => {
          const next = await apiFetch<Session>(base, {signal});
          change(next.data);
          setSaved(next);
        });
      }}>{saved ? "Reload music session" : "Open music session"}</button>
      {saved && <>
        <div className="flex flex-wrap items-end gap-2">
          <label>Private audio source
            <select className={`${control} block max-w-full`} value={assetId} onChange={event => setAssetId(event.target.value)}>
              <option value="">Choose an Audio Library file</option>
              {available.map(asset => <option key={asset.id} value={asset.id}>{asset.original_filename}</option>)}
            </select>
          </label>
          <button type="button" className={control} disabled={!available.some(asset => String(asset.id) === assetId) || data.tracks.length >= 4}
            onClick={() => void run(async signal => {
              const id = Number(assetId);
              const {buffer} = await loadBuffer(available.find(asset => asset.id === id), signal);
              const ms = Math.floor(buffer.duration * 1000);
              change({...data, tracks: [...data.tracks, {asset_id: id, duration_ms: ms, volume: 100, mute: false, solo: false,
                regions: [{start_ms: 0, end_ms: ms, offset_ms: 0, fade_in_ms: 0, fade_out_ms: 0}]}]});
              setAssetId("");
            })}>Add track to session</button>
        </div>
        <p className="text-sm text-zinc-300">Session files: up to 12 MiB and five minutes each. Timeline: up to ten minutes.</p>
        <p>Timeline length: {seconds(duration) || "—"} s</p>
        {data.tracks.map((track, index) => {
          const asset = assets.find(item => item.id === track.asset_id);
          const wave = peaks[track.asset_id];
          return <fieldset key={track.asset_id} className="space-y-2 rounded border border-zinc-700 p-3">
            <legend className="px-1 font-semibold">{asset?.original_filename ?? "Source no longer available"}</legend>
            <div className="flex flex-wrap gap-3">
              <button type="button" className={control} disabled={!asset} onClick={() => void run(async signal => { await loadBuffer(asset, signal); })}>Load waveform</button>
              <label>Volume ({track.volume}%)
                <input type="range" aria-label="Track volume" min={0} max={100} value={track.volume}
                  onChange={event => updateTrack(index, {volume: Number(event.target.value)})} />
              </label>
              <label><input type="checkbox" checked={track.mute} onChange={event => updateTrack(index, {mute: event.target.checked})} /> Mute track</label>
              <label><input type="checkbox" checked={track.solo} onChange={event => updateTrack(index, {solo: event.target.checked})} /> Solo track</label>
              <button type="button" className={control} onClick={() => {
                decoded.current.delete(track.asset_id);
                setPeaks(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== String(track.asset_id))));
                change({...data, tracks: data.tracks.filter(item => item.asset_id !== track.asset_id)});
              }}>Remove session track</button>
            </div>
            {wave && <svg className="h-16 w-full bg-black text-sky-400" viewBox="0 0 256 64" preserveAspectRatio="none"
              role="img" aria-label="Audio source waveform">
              {wave.map((peak, bin) => <line key={bin} x1={bin * 2} x2={bin * 2}
                y1={32 - peak * 30} y2={32 + peak * 30} stroke="currentColor" strokeWidth="1.4" />)}
            </svg>}
            {duration > 0 && Number.isFinite(duration) && <div aria-hidden="true" className="relative h-3 rounded bg-zinc-800">
              {track.regions.map((region, i) => <span key={i} className="absolute h-full rounded bg-sky-500"
                style={{left: `${region.offset_ms / duration * 100}%`, width: `${Math.max(0, length(region)) / duration * 100}%`}} />)}
            </div>}
            {track.regions.map((region, regionIndex) => <fieldset key={regionIndex} className="flex flex-wrap items-end gap-2 rounded border border-zinc-800 p-2">
              <legend className="px-1">Region {regionIndex + 1}</legend>
              {regionFields.map(([key, label]) => <label key={key}>{label} (s)
                <input className={`${control} block w-28`} type="number" min={0} step="0.001" value={seconds(region[key])}
                  onChange={event => {
                    const value = Math.round(event.target.valueAsNumber * 1000);
                    updateTrack(index, {regions: track.regions.map((item, i) => i === regionIndex ? {...item, [key]: value} : item)});
                  }} />
              </label>)}
              <button type="button" className={control} disabled={track.regions.length <= 1}
                onClick={() => updateTrack(index, {regions: track.regions.filter((_, i) => i !== regionIndex)})}>Remove region</button>
            </fieldset>)}
            <button type="button" className={control} disabled={track.regions.length >= 4}
              onClick={() => updateTrack(index, {regions: [...track.regions, {start_ms: 0, end_ms: track.duration_ms,
                offset_ms: Math.max(...track.regions.map(region => region.offset_ms + length(region))), fade_in_ms: 0, fade_out_ms: 0}]})}>Add audio region</button>
          </fieldset>;
        })}
        <fieldset className="space-y-2 rounded border border-zinc-700 p-3">
          <legend className="px-1 font-semibold">Session lyrics</legend>
          <p className="text-sm text-zinc-300">Write sections and optionally link them to a timeline range. Linked sections highlight during playback.</p>
          {data.lyrics.map((lyric, index) => {
            const update = (patch: Partial<Lyric>) => change({...data, lyrics: data.lyrics.map((item, i) => i === index ? {...item, ...patch} : item)});
            const highlighted = position !== undefined && lyric.start_ms !== null && lyric.end_ms !== null &&
              position >= lyric.start_ms && position < lyric.end_ms;
            return <fieldset key={index} className={`space-y-2 rounded border p-2 ${highlighted ? "border-sky-400 bg-sky-950" : "border-zinc-800"}`}>
              <legend className="px-1">Lyric section {index + 1}</legend>
              <label>Section name<input className={`${control} block`} maxLength={60} value={lyric.name} onChange={event => update({name: event.target.value})} /></label>
              <label>Lyrics<textarea className={`${control} block w-full`} rows={3} maxLength={4000}
                value={lyric.text} onChange={event => update({text: event.target.value})} /></label>
              <div className="flex flex-wrap gap-2">{(["start_ms", "end_ms"] as const).map(key => <label key={key}>
                {key === "start_ms" ? "Lyric starts (s)" : "Lyric ends (s)"}
                <input type="number" className={`${control} block w-28`} min={0} step="0.001" value={lyric[key] === null ? "" : seconds(lyric[key])}
                  onChange={event => update({[key]: event.target.value ? Math.round(event.target.valueAsNumber * 1000) : null})} />
              </label>)}</div>
              <button type="button" className={control} onClick={() => change({...data, lyrics: data.lyrics.filter((_, i) => i !== index)})}>Remove lyric section</button>
              {highlighted && <p>Playing this section</p>}
            </fieldset>;
          })}
          <button type="button" className={control} disabled={data.lyrics.length >= 12}
            onClick={() => change({...data, lyrics: [...data.lyrics, {name: `Section ${data.lyrics.length + 1}`, text: "", start_ms: null, end_ms: null}]})}>Add lyric section</button>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={control} disabled={!dirty} onClick={() => void run(async signal => {
            const next = await apiFetch<Session>(base, {method: "PUT", body: {version: saved.version, data}, signal});
            setSaved(next); setData(next.data); setMessage("Music session saved.");
          })}>Save music session</button>
          <button type="button" className={control} disabled={!data.tracks.length} onClick={play}>Preview session mix</button>
          <button type="button" className={control} disabled={position === undefined} onClick={stop}>Stop session preview</button>
        </div>
        <p>{dirty ? "Unsaved music session edits" : `Saved music session version ${saved.version}`}
          {position !== undefined ? ` · Preview at ${(position / 1000).toFixed(1)} s` : ""}</p>
      </>}
    </fieldset>
    {busy && <p role="status">Working…</p>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
