"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { deliveryError, downloadArtifact, projectPath } from "@/lib/creatorDelivery";

type Snapshot = {
  scene_version: number; gems: number; falls: number; resets: number; checkpoint: boolean; completed: boolean;
};
type Report = Snapshot & {id: string; saved_at: string; required_gems: number; note: string};

export default function PlaytestDelivery({ projectId, snapshot, started }: { projectId: number; snapshot: Snapshot; started: boolean }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const base = projectPath(projectId) + "/game";
  const {scene_version: version} = snapshot;

  async function run(action: "save" | "history" | "export") {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (action === "export") {
        await downloadArtifact(`${base}/browser-build.html?version=${version}`, "text/html; charset=utf-8", "indaverse-playable.html");
      } else {
        if (action === "save") {
          await apiFetch<Report>(base + "/playtests", {method: "POST", body: {...snapshot, note}});
          setMessage("Playtest saved.");
          setNote("");
        }
        setReports((await apiFetch<{items: Report[]}>(base + "/playtests")).items);
      }
    } catch (error) {
      setError(deliveryError(error));
    } finally {
      setBusy(false);
    }
  }

  return <section className="my-6 space-y-3">
    <h2>Playtest reports</h2>
    <p>Scene v{version} · {snapshot.falls} falls · {snapshot.resets} manual resets this visit</p>
    <label className="block">Playtest note <input maxLength={1000} value={note} onChange={event => setNote(event.target.value)} /></label>
    <button disabled={!started || busy} onClick={() => void run("save")}>Save playtest report</button>{" "}
    <button disabled={busy} onClick={() => void run("history")}>Load saved reports</button>{" "}
    <button disabled={busy} onClick={() => void run("export")}>Download offline browser build</button>
    <p>The download uses a lightweight Canvas view of this scene and opens without IndaVerse.</p>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    {reports && (reports.length ? <ul>{reports.map(report => <li key={report.id}>
      <strong>{report.completed ? "Completed" : "In progress"}</strong> · Scene v{report.scene_version} · {report.gems} / {report.required_gems} required gems
      {" · "}{report.falls} falls · {report.resets} resets{report.checkpoint ? " · Checkpoint reached" : ""}
      {" · "}<time dateTime={report.saved_at}>{new Date(report.saved_at).toLocaleString()}</time>
      {report.note && <p>{report.note}</p>}
    </li>)}</ul> : <p>No saved reports.</p>)}
  </section>;
}
