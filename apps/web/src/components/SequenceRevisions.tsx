"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Cut, SequenceDraft, SoundtrackSettings } from "@/lib/sequence-recovery.mjs";

type Revision = {version: number; clips: Cut[]; soundtrack_settings: SoundtrackSettings | null; compatible: boolean};
type Listing = {version: number; revisions: Revision[]};

export default function SequenceRevisions({base, version, dirty, busy, control, run, onRestore}: {
  base: string; version: number; dirty: boolean; busy: boolean; control: string;
  run: (action: (signal: AbortSignal) => Promise<void>) => Promise<void>;
  onRestore: (draft: SequenceDraft) => void;
}) {
  const [listing, setListing] = useState<Listing>();
  const [selected, setSelected] = useState<number>();
  const revision = listing?.revisions.find(item => item.version === selected);
  function load(signal: AbortSignal) {
    return apiFetch<Listing>(`${base}/revisions`, {signal});
  }
  return <fieldset disabled={busy} className="space-y-2 rounded border border-zinc-700 p-3">
    <legend className="px-1 font-semibold">Sequence revision history</legend>
    <p className="text-sm text-zinc-300">Review up to 30 saved versions. Media files are not copied.</p>
    <button type="button" className={control} onClick={() => void run(async signal => {
      setListing(await load(signal)); setSelected(undefined);
    })}>Load sequence revisions</button>
    {listing && (listing.revisions.length ? <label className="block">Saved revision
      <select className={`${control} block`} value={selected ?? ""} onChange={event => {
        setSelected(event.target.value ? Number(event.target.value) : undefined);
      }}>
        <option value="">Choose a version</option>
        {listing.revisions.map(item => <option key={item.version} value={item.version}>Version {item.version}</option>)}
      </select>
    </label> : <p>No versions recorded yet.</p>)}
    {revision && <div className="space-y-2">
      <p>Version {revision.version}: {revision.clips.length} cuts.</p>
      <ol className="list-decimal pl-6">{revision.clips.map(cut => <li key={cut.source_id}>
        {cut.title || "Untitled clip"} · {cut.start_ms / 1000}–{cut.end_ms / 1000}s
        {cut.caption ? ` · ${cut.caption}` : ""}
        {cut.caption_cues?.map(cue => <p key={cue.start_ms}>{cue.start_ms / 1000}–{cue.end_ms / 1000}s: {cue.text}</p>)}
      </li>)}</ol>
      {revision.soundtrack_settings && <p>Soundtrack: {revision.soundtrack_settings.volume_percent}% volume, starts at {revision.soundtrack_settings.offset_ms / 1000}s.</p>}
      {!revision.compatible && <p>The media has changed since this version. You can review its settings, but cannot restore it.</p>}
      <button type="button" className={control} disabled={dirty || !revision.compatible || listing?.version !== version || revision.version === version}
        onClick={() => void run(async signal => {
          const latest = await load(signal);
          const matched = latest.revisions.find(item => item.version === revision.version);
          if (latest.version !== version || !matched?.compatible) throw new Error("The saved sequence changed. Reload before restoring a revision.");
          onRestore({clips: matched.clips, soundtrackSettings: matched.soundtrack_settings ?? undefined});
        })}>Restore revision to editor</button>
      <p className="text-sm text-zinc-300">Restoring fills the editor. Save the sequence to create a new version.</p>
    </div>}
  </fieldset>;
}
