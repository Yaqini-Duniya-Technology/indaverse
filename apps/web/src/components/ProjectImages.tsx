"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import ProjectImage from "./ProjectImage";
import ImageGenerationRequests from "./ImageGenerationRequests";
import { getProject, type Project } from "@/lib/projects";
import {
  listImages, setProjectCover, uploadProjectImage,
  type ImageCategory, type ImagePage,
} from "@/lib/images";

const button = "rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-40";
const input = "mt-2 w-full rounded-lg border border-zinc-700 bg-black p-3";

export default function ProjectImages({
  projectId, onCoverChanged,
}: {
  projectId: number;
  onCoverChanged?: (project: Project) => void;
}) {
  const id = useId();
  const [project, setProject] = useState<Project | null>(null);
  const [page, setPage] = useState<ImagePage | null>(null);
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<ImageCategory>("reference");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lock = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setPage(null);
    setError("");
    void Promise.all([getProject(projectId), listImages(projectId, offset)])
      .then(([current, images]) => {
        if (active) { setProject(current); setPage(images); }
      }).catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Unable to load images.");
      }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, offset, retry]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !file || !label.trim()) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("Choose an image no larger than 10 MB.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await uploadProjectImage(projectId, file, label.trim(), category);
      setFile(null);
      setLabel("");
      if (fileInput.current) fileInput.current.value = "";
      setNotice("Image uploaded.");
      setOffset(0);
      setRetry((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function cover(imageId: number | null) {
    if (lock.current || !project || loading) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const coverVersion = project.cover_version;
      if (typeof coverVersion !== "number") {
        throw new Error(
          "Cover version is missing. Reload the project. If this continues, the API needs its project-cover update."
        );
      }
      const current = await setProjectCover(projectId, coverVersion, imageId);
      setProject(current);
      onCoverChanged?.(current);
      setNotice(imageId === null ? "Cover removed." : "Project cover updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change cover.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="my-8 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-5"
      aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="text-xl font-semibold">Images &amp; project cover</h2>
      <p className="mt-2 text-sm text-zinc-400">
        Collect character portraits, scenes, locations, and visual references.
        Choose an image as this project's cover.
      </p>
      {error && <p role="alert" className="mt-4 text-red-300">{error}</p>}
      {notice && <p role="status" className="mt-4 text-emerald-300">{notice}</p>}
      <ImageGenerationRequests key={projectId} projectId={projectId} />
      <form onSubmit={(event) => void upload(event)} className="mt-5">
        <fieldset disabled={busy}>
          <legend className="text-sm font-medium">Upload artwork</legend>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <div>
              <label htmlFor={`${id}-label`} className="text-sm">Image label</label>
              <input id={`${id}-label`} className={input} required maxLength={150}
                value={label} onChange={(event) => setLabel(event.target.value)}
                placeholder="Amina / The village at dawn..." />
            </div>
            <div>
              <label htmlFor={`${id}-category`} className="text-sm">Category</label>
              <select id={`${id}-category`} className={input} value={category}
                onChange={(event) => setCategory(event.target.value as ImageCategory)}>
                <option value="character">Character</option>
                <option value="scene">Scene</option>
                <option value="location">Location</option>
                <option value="reference">Reference</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-file`} className="text-sm">JPEG, PNG, or WebP</label>
              <input id={`${id}-file`} ref={fileInput} type="file" required
                accept="image/jpeg,image/png,image/webp" className={input}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-500">Maximum 10 MB and 16 megapixels. Still images only.</p>
          <button className={`${button} mt-4`} disabled={!file || !label.trim()}>
            {busy ? "Please wait..." : "Upload image"}
          </button>
        </fieldset>
      </form>
      <div className="my-5 flex flex-wrap gap-3">
        <button type="button" className={button} disabled={busy || loading}
          onClick={() => setRetry((value) => value + 1)}>Refresh library and cover</button>
        {project?.cover_image_id && (
          <button type="button" className={button} disabled={busy || loading}
            onClick={() => void cover(null)}>Remove cover</button>
        )}
      </div>
      {loading ? <p role="status">Loading image library...</p> : page && (
        <>
          {page.items.length === 0 && <p className="text-sm text-zinc-400">No images on this page yet.</p>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {page.items.map((asset) => (
              <article key={asset.id} className="overflow-hidden rounded-xl border border-zinc-800">
                <ProjectImage projectId={projectId} imageId={asset.id} alt={asset.label}
                  className="h-48 w-full object-contain bg-black" />
                <div className="p-4">
                  <h3 className="break-words font-medium">{asset.label}</h3>
                  <p className="my-2 text-xs capitalize text-zinc-400">
                    {asset.category} / {asset.width} x {asset.height}
                  </p>
                  <button type="button" className={button}
                    disabled={busy || !project || project.cover_image_id === asset.id}
                    onClick={() => void cover(asset.id)}>
                    {project?.cover_image_id === asset.id ? "Current cover" : "Use as project cover"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      <div className="mt-5 flex items-center gap-3">
        <button type="button" className={button} disabled={busy || loading || offset === 0}
          onClick={() => setOffset((value) => Math.max(0, value - 20))}>Previous</button>
        <span className="text-sm text-zinc-400">Page {offset / 20 + 1}</span>
        <button type="button" className={button} disabled={busy || loading || !page?.has_more}
          onClick={() => setOffset((value) => value + 20)}>Next</button>
      </div>
    </section>
  );
}
