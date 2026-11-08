"use client";

import { useState } from "react";
import { mapSequenceSrt, MAX_SRT_BYTES, type CaptionCue } from "@/lib/video-captions.mjs";

export default function SequenceSubtitleImport({cuts, signature, disabled, control, onApply}: {
  cuts: {name: string; duration: number}[]; signature: string; disabled: boolean; control: string;
  onApply: (groups: CaptionCue[][]) => void;
}) {
  const [preview, setPreview] = useState<{signature: string; groups: CaptionCue[][]}>();
  const [error, setError] = useState("");
  const ready = preview?.signature === signature;
  return <fieldset className="space-y-2 rounded border border-zinc-700 p-3" disabled={disabled}>
    <legend className="px-1 font-semibold">Whole-sequence subtitles</legend>
    <p className="text-sm text-zinc-300">Import an SRT timed against the final sequence. Cues across cut boundaries are split.</p>
    <label className="block">Choose sequence SRT
      <input type="file" accept=".srt,application/x-subrip" className={`${control} block max-w-full`}
        onChange={async event => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setPreview(undefined); setError("");
          try {
            if (file.size > MAX_SRT_BYTES) throw new Error("Choose an SRT file up to 16 KiB.");
            setPreview({signature, groups: mapSequenceSrt(await file.text(), cuts.map(cut => cut.duration))});
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not read that SRT file.");
          }
        }} />
    </label>
    {error && <p role="alert">{error}</p>}
    {preview && !ready && <p role="status">The sequence changed. Import the SRT again to review it.</p>}
    {preview && ready && <>
      <p>Caption preview by clip (times start at each cut):</p>
      <ul className="space-y-2">{preview.groups.map((cues, index) => <li key={index}>
        <strong>{cuts[index].name}</strong>
        {cues.length ? <ul>{cues.map(cue => <li key={cue.start_ms}>
          {cue.start_ms / 1000}–{cue.end_ms / 1000}s: {cue.text}
        </li>)}</ul> : " — no cues"}
      </li>)}</ul>
      <button type="button" className={control} onClick={() => {
        onApply(preview.groups);
        setPreview(undefined);
      }}>Replace captions in working sequence</button>
    </>}
  </fieldset>;
}
