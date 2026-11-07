"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Project } from "@/lib/projects";

type Job = { id: number; kind: string; status: string; created_at: string };
type Capabilities = { capabilities: { kind: string; available: boolean; provider: string | null }[] };
type History = { items: Job[]; has_more: boolean };
const button = "rounded border border-slate-500 px-3 py-2 disabled:opacity-50";

export default function CreativeWorkspace({ project, onSaved }: {
  project: Project;
  onSaved: (project: Project) => void;
}) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copy, setCopy] = useState<Project>();
  const [history, setHistory] = useState<History>();
  const [capabilities, setCapabilities] = useState<Capabilities>();
  const [offset, setOffset] = useState(0);
  const url = `/api/v1/projects/${project.id}`;

  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The request failed.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function loadHistory(next: number) {
    void run(async () => {
      const [support, result] = await Promise.all([
        apiFetch<Capabilities>("/api/v1/creative/capabilities"),
        apiFetch<History>(`/api/v1/creative/jobs?project_id=${project.id}&offset=${next}&limit=20`),
      ]);
      setCapabilities(support);
      setHistory(result);
      setOffset(next);
    });
  }

  return (
    <section className="my-6 space-y-3 rounded-xl bg-slate-900 p-5 text-slate-100" aria-labelledby="creative-workspace">
      <h2 id="creative-workspace" className="text-xl font-bold">Creative workspace</h2>
      <p>{project.archived_at ? "Archived. This project can still be opened and edited." : "Active project."}</p>
      <p>Duplicate saved studio content and the brief into a private project. Media, image links, plans, and earlier history are excluded.</p>
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={busy} onClick={() => void run(async () => {
          onSaved(await apiFetch<Project>(`${url}/archive`, {method: "PUT", body: {archived: !project.archived_at}}));
        })}>{project.archived_at ? "Unarchive project" : "Archive project"}</button>
        <button className={button} disabled={busy} onClick={() => void run(async () => {
          setCopy(await apiFetch<Project>(`${url}/duplicate`, {method: "POST"}));
        })}>Duplicate saved content</button>
        <Link href="/dashboard#creative-assets" className={button}>Browse my assets</Link>
      </div>
      {copy && <p role="status">Private copy created. <Link className="underline" href={`/projects/${copy.id}`}>Open {copy.name}</Link></p>}
      <h3 className="font-semibold">Creation modes</h3>
      <ul className="list-disc pl-5">
        <li><strong>Manual:</strong> Available in existing studio editors.</li>
        <li><strong>AI:</strong> Generation is unavailable until a provider is integrated and configured.</li>
        <li><strong>Hybrid:</strong> You can edit supported files you import manually. Integrated AI editing is unavailable.</li>
      </ul>
      <button className={button} disabled={busy} onClick={() => loadHistory(0)}>Load generation history</button>
      {capabilities && <p>{capabilities.capabilities.filter(item => item.available).length} of {capabilities.capabilities.length} generation capabilities available.</p>}
      {history && (
        <>
          {history.items.length === 0 ? <p>No recorded image or music requests.</p> :
            <ul className="list-disc pl-5">{history.items.map(job => (
              <li key={`${job.kind}-${job.id}`}>{job.kind} request #{job.id}: {job.status === "unavailable" ? "No provider available" : job.status} ({new Date(job.created_at).toLocaleDateString()})</li>
            ))}</ul>}
          <div className="flex gap-2">
            <button className={button} disabled={busy || offset === 0} onClick={() => loadHistory(offset - 20)}>Previous requests</button>
            <button className={button} disabled={busy || !history.has_more} onClick={() => loadHistory(offset + 20)}>Next requests</button>
          </div>
        </>
      )}
      {busy && <p role="status">Working…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
