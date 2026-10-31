"use client";

import { useEffect, useId, useRef, useState } from "react";
import ProjectImage from "./ProjectImage";
import { getStory, type Chapter } from "@/lib/story";
import { getCharacters, type StoryCharacter } from "@/lib/storyCharacters";
import { listImages, type ImagePage } from "@/lib/images";
import { getScenes, saveScenes, type SavedScenes, type StoryScene } from "@/lib/storyScenes";

const button = "rounded-xl border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-40";
const input = "mt-2 w-full rounded-xl border border-zinc-700 bg-black p-3";

export default function StoryScenesEditor({
  projectId, onStateChanged,
}: {
  projectId: number;
  onStateChanged: (state: { dirty: boolean; busy: boolean }) => void;
}) {
  const id = useId();
  const [scenes, setScenes] = useState<StoryScene[]>([]);
  const [baseline, setBaseline] = useState("[]");
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [characters, setCharacters] = useState<StoryCharacter[]>([]);
  const [images, setImages] = useState<ImagePage | null>(null);
  const [imageOffset, setImageOffset] = useState(0);
  const [choicesRefresh, setChoicesRefresh] = useState(0);
  const [choicesLoading, setChoicesLoading] = useState(true);
  const [choicesError, setChoicesError] = useState("");
  const lock = useRef(false);
  const dirty = JSON.stringify(scenes) !== baseline;

  useEffect(() => {
    onStateChanged({ dirty, busy });
  }, [dirty, busy, onStateChanged]);

  function apply(saved: SavedScenes) {
    setScenes(saved.scenes);
    setBaseline(JSON.stringify(saved.scenes));
    setVersion(saved.version);
    setReady(true);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setReady(false);
    setError("");
    void getScenes(projectId)
      .then((saved) => { if (active) apply(saved); })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Unable to load scenes.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, retry]);

  useEffect(() => {
    let active = true;
    setChoicesLoading(true);
    setChoicesError("");
    void Promise.all([
      getStory(projectId), getCharacters(projectId), listImages(projectId, imageOffset),
    ]).then(([story, cast, imagePage]) => {
      if (!active) return;
      setChapters(story?.chapters || []);
      setCharacters(cast.characters);
      setImages(imagePage);
    }).catch((err: unknown) => {
      if (active) setChoicesError(err instanceof Error ? err.message : "Unable to load link choices.");
    }).finally(() => { if (active) setChoicesLoading(false); });
    return () => { active = false; };
  }, [projectId, imageOffset, choicesRefresh]);

  async function save() {
    if (lock.current || !ready) return;
    if (scenes.some((scene) => !scene.title.trim())) {
      setError("Give each scene a title.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      apply(await saveScenes(projectId, version, scenes));
      setNotice("Scene plan saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save scenes.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function latest() {
    if (lock.current || !ready) return;
    if (dirty && !window.confirm(
      "Replace your scene draft with the saved plan? Export it first to keep a copy.",
    )) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      apply(await getScenes(projectId));
      setNotice("Latest saved scenes loaded.");
      setChoicesRefresh((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load scenes.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function exportDraft() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({
      project_id: projectId, expected_version: version, scenes,
    }, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `indaverse-story-${projectId}-scenes.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function edit(sceneId: string, changes: Partial<StoryScene>) {
    setScenes((current) => current.map((scene) =>
      scene.id === sceneId ? { ...scene, ...changes } : scene,
    ));
  }

  function move(index: number, direction: number) {
    setScenes((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <section className="my-8 rounded-2xl border border-zinc-800 p-5"
      aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="text-xl font-semibold">Scene plan</h2>
      <p className="mt-2 text-sm text-zinc-400">
        Arrange the moments of your story. Scenes save separately from chapters and characters.
        Save new chapters and characters before linking them here.
      </p>
      {error && <p role="alert" className="mt-4 text-red-300">{error}</p>}
      {notice && <p role="status" className="mt-4 text-emerald-300">{notice}</p>}
      {loading ? <p role="status" className="mt-4">Loading scenes...</p> : !ready ? (
        <button type="button" className={`${button} mt-4`}
          onClick={() => setRetry((value) => value + 1)}>Retry loading scenes</button>
      ) : (
        <>
          <div className="my-5 flex flex-wrap items-center gap-3">
            <button type="button" className={button} disabled={busy || scenes.length >= 200}
              onClick={() => setScenes((current) => [...current, {
                id: crypto.randomUUID(), title: "", setting: "", summary: "",
                chapter_id: null, character_ids: [], image_id: null,
              }])}>+ Add scene</button>
            <button type="button" className={`${button} bg-violet-600`}
              disabled={busy || !dirty} onClick={() => void save()}>
              {busy ? "Please wait..." : "Save scene plan"}
            </button>
            <button type="button" className={button} disabled={busy}
              onClick={() => void latest()}>Load latest scenes</button>
            <button type="button" className={button} disabled={busy}
              onClick={exportDraft}>Export scene draft</button>
            <span className="text-sm text-zinc-400">
              {dirty ? "Unsaved scene changes" : version ? `Saved version ${version}` : "No scenes saved yet"}
            </span>
          </div>
          <div className="mb-5 rounded-xl border border-zinc-800 p-4">
            {choicesError && <p role="alert" className="text-red-300">{choicesError}</p>}
            <p className="text-sm text-zinc-400">
              Refresh choices after saving chapters, characters, or uploading images.
              Refreshing choices keeps your scene draft.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className={button} disabled={busy || choicesLoading}
                onClick={() => setChoicesRefresh((value) => value + 1)}>Refresh link choices</button>
              <button type="button" className={button} disabled={busy || choicesLoading || imageOffset === 0}
                onClick={() => setImageOffset((value) => Math.max(0, value - 20))}>Previous images</button>
              <span className="text-xs text-zinc-400">
                {choicesLoading ? "Loading choices..." : `Image page ${imageOffset / 20 + 1}`}
              </span>
              <button type="button" className={button} disabled={busy || choicesLoading || !images?.has_more}
                onClick={() => setImageOffset((value) => value + 20)}>Next images</button>
            </div>
          </div>
          {scenes.length === 0 && <p className="text-zinc-400">Add a scene to start planning.</p>}
          <div className="space-y-5">
            {scenes.map((scene, index) => {
              const prefix = `${id}-${scene.id}`;
              const missingChapter = scene.chapter_id !== null &&
                !chapters.some((chapter) => chapter.id === scene.chapter_id);
              const imageOnPage = images?.items.some((image) => image.id === scene.image_id);
              return (
                <fieldset key={scene.id} disabled={busy}
                  className="min-w-0 rounded-xl border border-zinc-800 p-4">
                  <legend className="px-2 font-medium">Scene {index + 1}</legend>
                  <div className="mb-4 flex flex-wrap gap-2">
                    <button type="button" className={button} disabled={index === 0}
                      onClick={() => move(index, -1)}>Move up</button>
                    <button type="button" className={button} disabled={index === scenes.length - 1}
                      onClick={() => move(index, 1)}>Move down</button>
                    <button type="button" className={`${button} text-red-300`} onClick={() => {
                      if (window.confirm("Remove this scene from your draft? Export first to keep a copy.")) {
                        setScenes((current) => current.filter((item) => item.id !== scene.id));
                      }
                    }}>Remove scene</button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label htmlFor={`${prefix}-title`}>Title</label>
                      <input id={`${prefix}-title`} className={input} maxLength={150}
                        value={scene.title} onChange={(event) => edit(scene.id, { title: event.target.value })} />
                    </div>
                    <div>
                      <label htmlFor={`${prefix}-setting`}>Setting</label>
                      <input id={`${prefix}-setting`} className={input} maxLength={1000}
                        placeholder="Village square / dawn"
                        value={scene.setting} onChange={(event) => edit(scene.id, { setting: event.target.value })} />
                    </div>
                  </div>
                  <label htmlFor={`${prefix}-summary`} className="mt-4 block">What happens?</label>
                  <textarea id={`${prefix}-summary`} className={input} rows={4} maxLength={10000}
                    value={scene.summary} onChange={(event) => edit(scene.id, { summary: event.target.value })} />
                  <label htmlFor={`${prefix}-chapter`} className="mt-4 block">Saved chapter</label>
                  <select id={`${prefix}-chapter`} className={input} value={scene.chapter_id ?? ""}
                    disabled={choicesLoading || !!choicesError}
                    onChange={(event) => edit(scene.id, { chapter_id: event.target.value || null })}>
                    <option value="">No chapter linked</option>
                    {missingChapter && <option value={scene.chapter_id!}>Unavailable chapter: {scene.chapter_id}</option>}
                    {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
                  </select>
                  {scene.chapter_id !== null && (
                    <button type="button" className={`${button} mt-2`}
                      onClick={() => edit(scene.id, { chapter_id: null })}>Remove chapter link</button>
                  )}
                  <div className="mt-4">
                    <h3 className="text-sm font-medium">Characters in this scene</h3>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {characters.map((character) => (
                        <label key={character.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" disabled={choicesLoading || !!choicesError}
                            checked={scene.character_ids.includes(character.id)}
                            onChange={(event) => edit(scene.id, {
                              character_ids: event.target.checked
                                ? [...scene.character_ids, character.id]
                                : scene.character_ids.filter((value) => value !== character.id),
                            })} />
                          {character.name}
                        </label>
                      ))}
                    </div>
                    {scene.character_ids.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {scene.character_ids.map((characterId) => (
                          <button type="button" key={characterId} className={button}
                            onClick={() => edit(scene.id, {
                              character_ids: scene.character_ids.filter((value) => value !== characterId),
                            })}>
                            Remove {characters.find((character) => character.id === characterId)?.name || `unavailable character ${characterId}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <label htmlFor={`${prefix}-image`} className="mt-4 block">Scene image</label>
                  <select id={`${prefix}-image`} className={input} value={scene.image_id ?? ""}
                    disabled={choicesLoading || !!choicesError}
                    onChange={(event) => edit(scene.id, { image_id: event.target.value ? Number(event.target.value) : null })}>
                    <option value="">No image linked</option>
                    {scene.image_id !== null && !imageOnPage && (
                      <option value={scene.image_id}>Linked image #{scene.image_id} (outside this page or unavailable)</option>
                    )}
                    {images?.items.map((image) => <option key={image.id} value={image.id}>{image.label}</option>)}
                  </select>
                  {scene.image_id !== null && (
                    <>
                      <ProjectImage projectId={projectId} imageId={scene.image_id}
                        alt={scene.title || "Scene reference"} className="mt-4 h-48 w-full rounded-lg bg-black object-contain" />
                      <button type="button" className={`${button} mt-2`}
                        onClick={() => edit(scene.id, { image_id: null })}>Remove image link</button>
                    </>
                  )}
                </fieldset>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
