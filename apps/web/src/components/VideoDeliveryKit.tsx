"use client";

import { useEffect, useState } from "react";
import { apiDownload } from "@/lib/api";

type Props = {
  base: string; projectId: number; version: number; preset: string; burnCaptions: boolean;
  duration: number; hasCaptions: boolean; busy: boolean; dirty: boolean; rendererAvailable: boolean;
  control: string; run: (action: (signal: AbortSignal) => Promise<void>) => Promise<void>;
};

export default function VideoDeliveryKit({
  base, projectId, version, preset, burnCaptions, duration, hasCaptions,
  busy, dirty, rendererAvailable, control, run,
}: Props) {
  const [poster, setPoster] = useState("");
  const [srt, setSrt] = useState(true);
  const [vtt, setVtt] = useState(true);
  const [kit, setKit] = useState<string>();
  useEffect(() => () => { if (kit) URL.revokeObjectURL(kit); }, [kit]);

  const posterMs = Math.round(Number(poster) * 1000);
  const valid = !poster || (Number.isFinite(posterMs) && posterMs >= 0 && posterMs <= duration - 100);
  const blocker = dirty ? "Save your changes before preparing a kit." :
    duration <= 0 ? "Add a video clip to prepare a kit." :
    !rendererAvailable ? "Enable local video rendering to prepare a kit." :
    !valid ? "Choose a poster time at least 0.1 seconds before the video ends." : "";

  function prepare() {
    if (busy || blocker) return;
    setKit(undefined);
    const query = new URLSearchParams({
      version: String(version), preset, burn_captions: String(burnCaptions),
      include_srt: String(hasCaptions && srt), include_vtt: String(hasCaptions && vtt),
    });
    if (poster) query.set("poster_ms", String(posterMs));
    void run(async signal => {
      const file = await apiDownload(`${base}/delivery?${query}`, new Blob(), "application/octet-stream", "application/zip", signal);
      if (!signal.aborted) setKit(URL.createObjectURL(file));
    });
  }

  return <fieldset className="space-y-3 rounded border border-zinc-700 p-3" disabled={busy}>
    <legend className="px-1 font-semibold">Publishing kit</legend>
    <p className="text-sm text-zinc-300">Download a ZIP for your saved sequence using the video format and caption setting above.</p>
    <label>Poster time (seconds)
      <input type="number" min={0} max={Math.max(0, duration - 100) / 1000} step={0.001}
        placeholder="Video midpoint" className={`${control} block w-44`} value={poster}
        onChange={event => { setPoster(event.target.value); setKit(undefined); }} />
    </label>
    {hasCaptions && <div className="flex flex-wrap gap-4">
      <label className="flex gap-2"><input type="checkbox" checked={srt}
        onChange={event => { setSrt(event.target.checked); setKit(undefined); }} />Include SRT in kit</label>
      <label className="flex gap-2"><input type="checkbox" checked={vtt}
        onChange={event => { setVtt(event.target.checked); setKit(undefined); }} />Include WebVTT in kit</label>
    </div>}
    <p className="text-sm text-zinc-300">Included: MP4, JPEG poster, edit timing CSV, publishing checklist and file manifest
      {hasCaptions ? ", plus a timestamped transcript and selected subtitle formats." : "."}</p>
    {blocker && <p className="text-sm" role="status">{blocker}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={control} disabled={!!blocker} onClick={prepare}>Prepare publishing kit</button>
      {kit && !blocker && <a className={control} href={kit} download={`indaverse-${projectId}-delivery.zip`}>Download publishing kit ZIP</a>}
    </div>
  </fieldset>;
}
