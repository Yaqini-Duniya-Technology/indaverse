"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Project } from "@/lib/projects";

type Kind = "image" | "audio";
type Asset = { kind: Kind; id: number; project_id: number; project_name: string; name: string; file_size: number };
type Page = { items: Asset[]; has_more: boolean };
const button = "rounded border border-slate-500 px-3 py-2 disabled:opacity-50";

export default function CreativeAssetLibrary({ projects }: { projects: Project[] }) {
  const lock = useRef(false);
  const [kind, setKind] = useState<Kind | "">("");
  const [page, setPage] = useState<Page>();
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Asset>();
  const [destination, setDestination] = useState("");
  const [permission, setPermission] = useState(false);
  const [copied, setCopied] = useState<number>();

  async function load(next: number, filter: Kind | "") {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<Page>(`/api/v1/creative/assets?limit=20&offset=${next}${filter ? `&kind=${filter}` : ""}`);
      setPage(result);
      setOffset(next);
      setKind(filter);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the library.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function copyImage() {
    if (lock.current || !selected || !destination || !permission) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setCopied(undefined);
    try {
      const target = Number(destination);
      await apiFetch(`/api/v1/projects/${selected.project_id}/images/${selected.id}/copy`, {
        method: "POST",
        body: {destination_project_id: target, permission_confirmed: true},
      });
      setCopied(target);
      setSelected(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not copy the image.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section id="creative-assets" className="my-8 space-y-3 rounded-xl bg-slate-900 p-5 text-slate-100" aria-labelledby="creative-assets-heading">
      <h2 id="creative-assets-heading" className="text-xl font-bold">My asset library</h2>
      <p>Find saved images and audio across your projects, including archived projects. Copy an image to another project you own, or open the source project to preview or download an original.</p>
      <div className="flex flex-wrap gap-2">
        <button className={button} aria-pressed={!!page && kind === ""} disabled={busy} onClick={() => void load(0, "")}>All assets</button>
        <button className={button} aria-pressed={!!page && kind === "image"} disabled={busy} onClick={() => void load(0, "image")}>Images</button>
        <button className={button} aria-pressed={!!page && kind === "audio"} disabled={busy} onClick={() => void load(0, "audio")}>Audio</button>
      </div>
      {page && (page.items.length === 0 ? <p>No matching assets.</p> : (
        <ul className="space-y-2">{page.items.map(asset => (
          <li key={`${asset.kind}-${asset.id}`} className="break-words">
            <strong>{asset.name}</strong> · {asset.kind} · {Math.ceil(asset.file_size / 1024)} KB ·{" "}
            <Link className="underline" href={`/projects/${asset.project_id}${asset.kind === "image" ? "#project-images" : "/music"}`}>{asset.project_name}</Link>
            {asset.kind === "image" && <button className={`${button} ml-2`} disabled={busy} onClick={() => {
              setSelected(asset); setDestination(""); setPermission(false); setCopied(undefined); setError("");
            }}>Copy image</button>}
          </li>
        ))}</ul>
      ))}
      {page && <div className="flex gap-2">
        <button className={button} disabled={busy || offset === 0} onClick={() => void load(offset - 20, kind)}>Previous assets</button>
        <button className={button} disabled={busy || !page.has_more} onClick={() => void load(offset + 20, kind)}>Next assets</button>
      </div>}
      {selected && <form className="space-y-2" onSubmit={event => { event.preventDefault(); void copyImage(); }}>
        <h3 className="font-semibold">Copy {selected.name}</h3>
        <label className="block">Destination project{" "}
          <select className="rounded border border-slate-500 bg-slate-900 p-2" value={destination} disabled={busy} onChange={event => setDestination(event.target.value)}>
            <option value="">Choose a project</option>
            {projects.filter(project => project.id !== selected.project_id).map(project =>
              <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <label className="block"><input type="checkbox" checked={permission} disabled={busy} onChange={event => setPermission(event.target.checked)} /> I have permission to reuse this image.</label>
        <button className={button} disabled={busy || !destination || !permission}>Copy to project</button>{" "}
        <button className={button} type="button" disabled={busy} onClick={() => setSelected(undefined)}>Cancel</button>
      </form>}
      {copied && <p role="status">Image copied. <Link className="underline" href={`/projects/${copied}#project-images`}>Open destination images</Link></p>}
      {busy && <p role="status">Working…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
