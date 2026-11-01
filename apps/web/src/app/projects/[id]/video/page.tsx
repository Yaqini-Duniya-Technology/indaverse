"use client";

import Link from "next/link";
import StudioWorkbench from "@/components/StudioWorkbench";
import DraftExchange from "@/components/DraftExchange";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import ProjectImage from "@/components/ProjectImage";
import VideoHistory from "./VideoHistory";
import { getProject } from "@/lib/projects";
import { listImages, type ProjectImage as ImageAsset } from "@/lib/images";
import { getVideo, saveVideo, type VideoData, type VideoShot } from "@/lib/video";

const blank: VideoData = { title: "", script: "", aspect_ratio: "16:9", shots: [] };
const field = "mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-violet-400";
const button = "rounded-xl border border-zinc-700 px-4 py-2 text-sm transition hover:bg-zinc-800 disabled:opacity-40";
const primary = `${button} border-violet-500 bg-violet-600 font-semibold hover:bg-violet-500`;

export default function VideoStudioPage() {
  const params = useParams();
  return <VideoEditor key={String(params.id)} projectId={Number(params.id)} />;
}

function VideoEditor({ projectId }: { projectId: number }) {
  const [data, setData] = useState<VideoData>(blank);
  const [baseline, setBaseline] = useState(JSON.stringify(blank));
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  const dirty = JSON.stringify(data) !== baseline;

  const [images, setImages] = useState<ImageAsset[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [imageRetry, setImageRetry] = useState(0);

  function apply(saved: VideoData, savedVersion: number) {
    const next: VideoData = {
      title: saved.title, script: saved.script,
      aspect_ratio: saved.aspect_ratio, shots: saved.shots,
    };
    setData(next);
    setBaseline(JSON.stringify(next));
    setVersion(savedVersion);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setReady(false);
      setError("");
      setNotice("");
      try {
        if (!Number.isSafeInteger(projectId) || projectId < 1) {
          throw new Error("Invalid project ID.");
        }
        const project = await getProject(projectId);
        if (!["video", "music_video"].includes(project.project_type)) {
          throw new Error("Open Video Studio from a video project.");
        }
        let saved;
        try {
          saved = await getVideo(projectId);
        } catch (err) {
          if (!(err instanceof Error) || err.message !== "No video draft saved yet.") throw err;
        }
        if (!active) return;
        apply(saved ?? { ...blank, title: project.name, shots: [] }, saved?.version ?? 0);
        setReady(true);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load Video Studio.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [projectId, retry]);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    setImageLoading(true);
    setImageError("");
    void listImages(projectId, offset).then((page) => {
      if (!active) return;
      setImages(page.items);
      setHasMore(page.has_more);
    }).catch((err) => {
      if (active) setImageError(err instanceof Error ? err.message : "Unable to load images.");
    }).finally(() => {
      if (active) setImageLoading(false);
    });
    return () => { active = false; };
  }, [projectId, ready, offset, imageRetry]);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (dirty || saving) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    function navigation(event: MouseEvent) {
      if (event.defaultPrevented || !(event.target instanceof Element)) return;
      const anchor = event.target.closest("a");
      if (!anchor || anchor.hasAttribute("download") || anchor.target === "_blank") return;
      const target = new URL(anchor.href, window.location.href);
      if (target.origin === location.origin &&
          target.pathname === location.pathname && target.search === location.search) return;
      if (saving || lock.current) {
        event.preventDefault();
        event.stopPropagation();
        setNotice("Wait for your save to finish before leaving.");
      } else if (dirty && !window.confirm("Leave without saving this video draft? Export it first if you want to keep a copy.")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", navigation, true);
    };
  }, [dirty, saving]);

  function updateShot(id: string, changes: Partial<VideoShot>) {
    setData((current) => ({
      ...current,
      shots: current.shots.map((shot) => shot.id === id ? { ...shot, ...changes } : shot),
    }));
    setNotice("");
  }
  function moveShot(index: number, direction: number) {
    setData((current) => {
      const shots = [...current.shots];
      const target = index + direction;
      if (target < 0 || target >= shots.length) return current;
      [shots[index], shots[target]] = [shots[target], shots[index]];
      return { ...current, shots };
    });
  }
  function exportDraft() {
    const blob = new Blob([JSON.stringify({
      project_id: projectId, expected_version: version, ...data,
    }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `indaverse-video-${projectId}-draft.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Draft exported. Your database version has not changed.");
  }
  async function save() {
    if (lock.current || !ready || !dirty) return;
    if (!data.title.trim() || data.shots.some((shot) => !shot.title.trim())) {
      setError("Give the video and every shot a title.");
      return;
    }
    if (data.shots.some((shot) =>
      !Number.isInteger(shot.duration_seconds) || shot.duration_seconds < 1 || shot.duration_seconds > 300
    )) {
      setError("Each shot needs a whole-number duration from 1 to 300 seconds.");
      return;
    }
    lock.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveVideo(projectId, version, {
        ...data, title: data.title.trim(),
        shots: data.shots.map((shot) => ({ ...shot, title: shot.title.trim() })),
      });
      apply(saved, saved.version);
      setNotice("Video script and shot plan saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save video.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  function loadLatest() {
    if (lock.current) return;
    if (dirty && !window.confirm("Replace this unsaved draft with the saved video? Export your draft first to keep it.")) return;
    setRetry((value) => value + 1);
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-black text-zinc-300" aria-busy="true">Opening Video Studio...</main>;
  }
  if (!ready) {
    return <main className="min-h-screen bg-black p-8 text-white">
      <Link href={`/projects/${projectId}`} className={button}>Back to project</Link>
      <h1 className="mt-8 text-3xl font-bold">Unable to open Video Studio</h1>
      <p role="alert" className="my-4 text-red-300">{error}</p>
      <button className={button} onClick={loadLatest}>Retry</button>
    </main>;
  }

  const total = data.shots.reduce((sum, shot) =>
    sum + (Number.isFinite(shot.duration_seconds) ? shot.duration_seconds : 0), 0);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <a href="#editor" className="sr-only focus:not-sr-only">Skip to editor</a>
      <nav className="border-b border-zinc-800 px-6 py-5" aria-label="Video navigation">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Link href="/dashboard" className="text-xl font-bold">IndaVerse</Link>
          <Link href={`/projects/${projectId}`} className={button}>Back to project</Link>
        </div>
      </nav>
      <div id="editor" className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        <header className="rounded-3xl border border-violet-900 bg-gradient-to-br from-violet-950 to-zinc-950 p-8">
          <p className="text-xs font-semibold tracking-widest text-violet-300">YOUR VISUAL WORKSPACE</p>
          <h1 className="mt-3 text-4xl font-bold">Video Studio</h1>
          <p className="mt-3 max-w-2xl text-zinc-300">Write the script. Plan each shot. Give your idea a visual direction.</p>
          <p className="mt-4 text-sm text-zinc-400">Script and storyboard planning are available. AI video generation is not connected yet.</p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <button className={primary} disabled={saving || !dirty} onClick={() => void save()}>
            {saving ? "Saving..." : "Save video"}
          </button>
          <button className={button} disabled={saving} onClick={exportDraft}>Export draft</button>
          <Link className={button} href={`/projects/${projectId}/video/preview`}>Preview saved storyboard</Link>
          <button className={button} disabled={saving} onClick={loadLatest}>Load saved video</button>
          <span className="text-sm text-zinc-400">{dirty ? "Unsaved changes" : version ? `Saved version ${version}` : "New draft"}</span>
        </div>
        {error && <p role="alert" className="rounded-xl border border-red-900 bg-red-950/30 p-4 text-red-300">{error}</p>}
        {notice && <p role="status" className="text-violet-200">{notice}</p>}

        <DraftExchange studio="video" projectId={projectId} data={data} version={version} dirty={dirty} disabled={saving}
          onApply={next => {
            if (lock.current || saving) return false;
            setData(next); setNotice("Reviewed draft applied. Save manually when ready."); return true;
          }} />
        <StudioWorkbench kind="video" projectId={projectId} data={data} version={version} dirty={dirty} />
        <fieldset disabled={saving} className="space-y-8">
          <legend className="sr-only">Video script and shots</legend>
          <section className="rounded-2xl border border-zinc-800 bg-black p-6">
            <h2 className="text-xl font-semibold">The story on screen</h2>
            <div className="mt-5 grid gap-5 md:grid-cols-[1fr_200px]">
              <label>Video title
                <input className={field} value={data.title} maxLength={150}
                  onChange={(event) => setData({ ...data, title: event.target.value })} />
              </label>
              <label>Frame format
                <select className={field} value={data.aspect_ratio}
                  onChange={(event) => setData({ ...data, aspect_ratio: event.target.value as VideoData["aspect_ratio"] })}>
                  <option value="16:9">Landscape 16:9</option>
                  <option value="9:16">Portrait 9:16</option>
                  <option value="1:1">Square 1:1</option>
                </select>
              </label>
            </div>
            <label className="mt-5 block">Script
              <textarea className={field} rows={10} maxLength={100000} value={data.script}
                placeholder="Describe the action, narration, and dialogue..."
                onChange={(event) => setData({ ...data, script: event.target.value })} />
            </label>
          </section>

          <section className="space-y-5" aria-labelledby="shots-heading">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div><h2 id="shots-heading" className="text-2xl font-semibold">Shot plan</h2>
                <p className="mt-1 text-sm text-zinc-400">{data.shots.length} shots / {total} seconds planned</p>
              </div>
              <button className={button} disabled={data.shots.length >= 200} onClick={() =>
                setData((current) => ({ ...current, shots: [...current.shots, {
                  id: crypto.randomUUID(), title: `Shot ${current.shots.length + 1}`,
                  description: "", camera_direction: "", duration_seconds: 5, image_id: null,
                }] }))
              }>+ Add shot</button>
            </div>
            <div className="rounded-xl border border-zinc-800 p-4 text-sm text-zinc-400">
              Upload scene or reference images from the project home page, then refresh this image picker.
              <div className="mt-3 flex flex-wrap gap-3">
                <button className={button} disabled={imageLoading || offset === 0} onClick={() => setOffset((value) => Math.max(0, value - 20))}>Previous images</button>
                <button className={button} disabled={imageLoading || !!imageError || !hasMore} onClick={() => setOffset((value) => value + 20)}>Next images</button>
                <button className={button} disabled={imageLoading} onClick={() => setImageRetry((value) => value + 1)}>Refresh images</button>
              </div>
              {imageLoading && <p role="status" className="mt-2">Loading images...</p>}
              {imageError && <p role="alert" className="mt-2 text-amber-300">{imageError}</p>}
            </div>
            {!data.shots.length && <p className="rounded-2xl border border-dashed border-zinc-700 p-8 text-zinc-400">Add your first shot to start building the storyboard.</p>}
            {data.shots.map((shot, index) => (
              <article key={shot.id} className="rounded-2xl border border-zinc-800 bg-black p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold">Shot {index + 1}</h3>
                  <div className="flex gap-2">
                    <button className={button} disabled={index === 0} onClick={() => moveShot(index, -1)} aria-label={`Move shot ${index + 1} up`}>Up</button>
                    <button className={button} disabled={index === data.shots.length - 1} onClick={() => moveShot(index, 1)} aria-label={`Move shot ${index + 1} down`}>Down</button>
                    <button className={button} onClick={() => {
                      if (window.confirm(`Remove "${shot.title}" from this draft?`)) {
                        setData((current) => ({ ...current, shots: current.shots.filter((item) => item.id !== shot.id) }));
                      }
                    }}>Remove</button>
                  </div>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <label>Shot title<input className={field} maxLength={150} value={shot.title}
                    onChange={(event) => updateShot(shot.id, { title: event.target.value })} /></label>
                  <label>Duration in seconds<input className={field} type="number" min={1} max={300} step={1}
                    value={shot.duration_seconds || ""}
                    onChange={(event) => updateShot(shot.id, { duration_seconds: Number(event.target.value) })} /></label>
                  <label>Visual description<textarea className={field} rows={4} maxLength={10000} value={shot.description}
                    onChange={(event) => updateShot(shot.id, { description: event.target.value })} /></label>
                  <label>Camera direction<textarea className={field} rows={4} maxLength={1000} value={shot.camera_direction}
                    placeholder="Wide shot, slow pan, close-up..."
                    onChange={(event) => updateShot(shot.id, { camera_direction: event.target.value })} /></label>
                  <div>
                    <label>Reference image<select className={field} value={shot.image_id ?? ""}
                      disabled={imageLoading || !!imageError}
                      onChange={(event) => updateShot(shot.id, { image_id: event.target.value ? Number(event.target.value) : null })}>
                      <option value="">No image</option>
                      {shot.image_id !== null && !images.some((image) => image.id === shot.image_id) &&
                        <option value={shot.image_id}>Linked image #{shot.image_id} (outside this page or unavailable)</option>}
                      {images.map((image) => <option key={image.id} value={image.id}>{image.label} / {image.category}</option>)}
                    </select></label>
                    {shot.image_id !== null && <button className={`${button} mt-3`}
                      onClick={() => updateShot(shot.id, { image_id: null })}>Remove image link</button>}
                  </div>
                  {shot.image_id !== null && <ProjectImage projectId={projectId} imageId={shot.image_id}
                    alt={`Reference for ${shot.title}`} className="h-48 w-full rounded-xl object-contain" />}
                </div>
              </article>
            ))}
          </section>
        </fieldset>
        <VideoHistory projectId={projectId} savedVersion={version} disabled={saving}
          onRestore={(revision) => {
            if (lock.current) return;
            if (dirty && !window.confirm("Replace your unsaved video draft with this revision? Export your draft first to keep it.")) return;
            setData({
              ...revision.snapshot,
              shots: revision.snapshot.shots.map((shot) => ({ ...shot })),
            });
            setError("");
            setNotice(`Revision version ${revision.version} loaded into your draft. Review it, then save to create a new version.`);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }} />
        <p className="pb-8 text-sm text-zinc-500">Shot durations describe your plan. No rendered video has been generated.</p>
      </div>
    </main>
  );
}
