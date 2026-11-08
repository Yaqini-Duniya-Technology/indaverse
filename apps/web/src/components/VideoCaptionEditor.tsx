"use client";

import { useState } from "react";
import { MAX_CUES_PER_CLIP, MAX_SRT_BYTES, parseSrt, validateCues, type CaptionCue } from "@/lib/video-captions.mjs";

type CaptionChanges = {caption: string; caption_cues: CaptionCue[]};
type Props = {
  caption: string; cues: CaptionCue[]; duration: number; offset: number; disabled: boolean;
  control: string; onChange: (changes: CaptionChanges) => void;
};

const seconds = (ms: number) => Number.isFinite(ms) ? String(ms / 1000) : "";

export default function VideoCaptionEditor({caption, cues, duration, offset, disabled, control, onChange}: Props) {
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const cueError = validateCues(cues, duration);
  const latestEnd = Math.max(0, ...cues.map(cue => cue.end_ms));
  const canAppend = cues.length < MAX_CUES_PER_CLIP && Number.isFinite(latestEnd) && duration - latestEnd >= 100;

  function edit(index: number, change: Partial<CaptionCue>) {
    onChange({caption: "", caption_cues: cues.map((cue, i) => i === index ? {...cue, ...change} : cue)});
  }

  return <fieldset disabled={disabled || importing} className="space-y-2 rounded border border-zinc-700 p-3">
    <legend className="px-1 font-semibold">Captions</legend>
    <p className="text-sm text-zinc-300">Timed captions start at zero for this cut, after trimming. Use up to six per clip.</p>
    {cues.length === 0 && <label className="block min-w-0 max-w-full">Caption (optional, entire cut)
      <input type="text" maxLength={90} className={`${control} block w-72 max-w-full`}
        value={caption} onChange={event => onChange({caption: event.target.value, caption_cues: []})} />
    </label>}
    {cues.map((cue, index) => <fieldset key={index} className="space-y-2 rounded border border-zinc-800 p-2">
      <legend className="px-1">Caption {index + 1}</legend>
      <label>Caption text
        <textarea rows={2} maxLength={90} className={`${control} block w-72 max-w-full`} value={cue.text}
          onChange={event => edit(index, {text: event.target.value})} />
      </label>
      <div className="flex flex-wrap items-end gap-2">
        {(["start_ms", "end_ms"] as const).map(key => <label key={key}>
          {key === "start_ms" ? "Caption starts (seconds)" : "Caption ends (seconds)"}
          <input type="number" min={0} max={duration / 1000} step="0.001" className={`${control} block w-32`}
            value={seconds(cue[key])}
            onChange={event => edit(index, {[key]: Math.round(event.target.valueAsNumber * 1000)})} />
        </label>)}
        <label>Caption position
          <select className={`${control} block`} value={cue.position ?? "bottom"}
            onChange={event => edit(index, {position: event.target.value === "top" ? "top" : "bottom"})}>
            <option value="bottom">Bottom</option><option value="top">Top</option>
          </select>
        </label>
        <button type="button" className={control} onClick={() =>
          onChange({caption: "", caption_cues: cues.filter((_, i) => i !== index)})}>Remove caption {index + 1}</button>
      </div>
      {[offset, cue.start_ms, cue.end_ms].every(Number.isFinite) &&
        <p className="text-sm text-zinc-300">In the video: {seconds(offset + cue.start_ms)}–{seconds(offset + cue.end_ms)} s</p>}
    </fieldset>)}
    {cueError && <p role="alert">{cueError}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={control} disabled={!canAppend} onClick={() => onChange({
        caption: "",
        caption_cues: [...cues, {start_ms: latestEnd, end_ms: caption ? duration : Math.min(duration, latestEnd + 1000),
          text: caption, position: "bottom"}],
      })}>{caption ? "Make caption timed" : "Add timed caption"}</button>
      <label className="block">Import SRT for this cut
        <input type="file" accept=".srt,application/x-subrip" className={`${control} block max-w-full`}
          onChange={async event => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (file.size > MAX_SRT_BYTES) { setImportError("Choose an SRT file up to 16 KiB."); return; }
            setImporting(true);
            setImportError("");
            try {
              const imported = parseSrt(await file.text(), duration);
              if ((caption || cues.length) && !window.confirm("Replace this cut’s captions with the imported SRT?")) return;
              onChange({caption: "", caption_cues: imported});
            } catch (error) {
              setImportError(error instanceof Error ? error.message : "Could not import this SRT file.");
            } finally {
              setImporting(false);
            }
          }} />
      </label>
    </div>
    {importError && <p role="alert">{importError}</p>}
  </fieldset>;
}
