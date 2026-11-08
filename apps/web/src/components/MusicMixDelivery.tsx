"use client";

import { useEffect, useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";
import { getProjects, type Project } from "@/lib/projects";

type Run = (action: (signal: AbortSignal) => Promise<void>) => Promise<void>;
export default function MusicMixDelivery({base, version, duration, dirty, busy, control, run}: {
  base: string; version: number; duration: number; dirty: boolean; busy: boolean; control: string; run: Run;
}) {
  const [file, setFile] = useState<{url: string; extension: string}>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [destination, setDestination] = useState("");
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("");
  const [sent, setSent] = useState(false);
  useEffect(() => () => { if (file) URL.revokeObjectURL(file.url); }, [file]);
  const enabled = !dirty && version > 0 && duration > 0;
  const a = Math.round(Number(start) * 1000);
  const b = end ? Math.round(Number(end) * 1000) : Math.min(duration, a + 119900);
  const valid = Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b <= duration && b - a >= 250 && b - a <= 119900;
  return <fieldset disabled={busy} className="space-y-2 rounded border border-zinc-700 p-3">
    <legend className="px-1 font-semibold">Mixdown delivery</legend>
    <p className="text-sm text-zinc-300">Render from the saved arrangement with the local FFmpeg renderer.</p>
    {!enabled && <p>Save a session with tracks before exporting.</p>}
    <div className="flex flex-wrap gap-2">
      {(["wav", "mp3"] as const).map(extension => <button key={extension} type="button" className={control}
        disabled={!enabled} onClick={() => void run(async signal => {
          const output = await apiDownload(`${base}/mix/${extension}?version=${version}`, new Blob(),
            "application/octet-stream", extension === "wav" ? "audio/wav" : "audio/mpeg", signal);
          if (!signal.aborted) setFile({url: URL.createObjectURL(output), extension});
        })}>Prepare {extension.toUpperCase()} mixdown</button>)}
      {file && enabled && <a className={control} href={file.url} download={`indaverse-mix-v${version}.${file.extension}`}>Download {file.extension.toUpperCase()} mixdown</a>}
    </div>
    <button type="button" className={control} disabled={!enabled} onClick={() => void run(async signal => {
      const items = await getProjects();
      if (!signal.aborted) setProjects(items.filter(item => item.project_type === "video" || item.project_type === "music_video"));
    })}>Load destination video projects</button>
    {projects.length > 0 && <div className="flex flex-wrap items-end gap-2">
      <label>Destination video
        <select className={`${control} block`} value={destination} onChange={event => {setDestination(event.target.value); setSent(false);}}>
          <option value="">Choose a project</option>
          {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </label>
      <label>Mix start (seconds)<input type="number" min={0} step=".001" className={`${control} block w-32`} value={start} onChange={event => setStart(event.target.value)} /></label>
      <label>Mix end (seconds)<input type="number" min={0} step=".001" placeholder={String(b / 1000)} className={`${control} block w-32`} value={end} onChange={event => setEnd(event.target.value)} /></label>
      <button type="button" className={control} disabled={!enabled || !destination || !valid}
        onClick={() => void run(async signal => {
          setSent(false);
          const target = await apiFetch<{version: number; clips: unknown[]; soundtrack: unknown}>(`/api/v1/projects/${destination}/video/sequence`, {signal});
          if (!target.clips.length) throw new Error("Add a clip to the destination video first.");
          if (target.soundtrack && !window.confirm("Replace the saved soundtrack in this video?")) return;
          await apiFetch(`${base}/send-to-video`, {method: "POST", signal, body: {
            version, destination_id: Number(destination), destination_version: target.version, start_ms: a, end_ms: b,
          }});
          setSent(true);
        })}>Send mix to video soundtrack</button>
    </div>}
    {sent && <p role="status">Mix attached. Open or reload the destination sequence.</p>}
  </fieldset>;
}
