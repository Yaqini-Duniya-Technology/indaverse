"use client";

import { useEffect, useId, useRef, useState } from "react";
import ProjectImage from "./ProjectImage";
import { listImages, type ImagePage } from "@/lib/images";
import {
  getCharacters, saveCharacters,
  type SavedCharacters, type StoryCharacter,
} from "@/lib/storyCharacters";

const button = "rounded-xl border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-40";
const input = "mt-2 w-full rounded-xl border border-zinc-700 bg-black p-3";

export default function StoryCharactersEditor({
  projectId, onStateChanged,
}: {
  projectId: number;
  onStateChanged: (state: { dirty: boolean; busy: boolean }) => void;
}) {
  const id = useId();
  const [characters, setCharacters] = useState<StoryCharacter[]>([]);
  const [baseline, setBaseline] = useState("[]");
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [images, setImages] = useState<ImagePage | null>(null);
  const [imageOffset, setImageOffset] = useState(0);
  const [imageRefresh, setImageRefresh] = useState(0);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [imageError, setImageError] = useState("");
  const lock = useRef(false);
  const dirty = JSON.stringify(characters) !== baseline;

  useEffect(() => {
    onStateChanged({ dirty, busy });
  }, [dirty, busy, onStateChanged]);

  function apply(saved: SavedCharacters) {
    setCharacters(saved.characters);
    setBaseline(JSON.stringify(saved.characters));
    setVersion(saved.version);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void getCharacters(projectId)
      .then((saved) => { if (active) apply(saved); })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Unable to load characters.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, retry]);

  useEffect(() => {
    let active = true;
    setImagesLoading(true);
    setImageError("");
    setImages(null);
    void listImages(projectId, imageOffset)
      .then((page) => { if (active) setImages(page); })
      .catch((err: unknown) => {
        if (active) setImageError(err instanceof Error ? err.message : "Unable to load portraits.");
      })
      .finally(() => { if (active) setImagesLoading(false); });
    return () => { active = false; };
  }, [projectId, imageOffset, imageRefresh]);

  async function save() {
    if (lock.current || loading) return;
    if (characters.some((character) => !character.name.trim())) {
      setError("Give each character a name.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveCharacters(projectId, version, characters);
      apply(saved);
      setNotice("Character profiles saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save characters.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function latest() {
    if (lock.current || loading) return;
    if (dirty && !window.confirm(
      "Replace your character draft with saved profiles? Export it first to keep a copy.",
    )) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      apply(await getCharacters(projectId));
      setNotice("Latest character profiles loaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load characters.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function exportDraft() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({
      project_id: projectId, expected_version: version, characters,
    }, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `indaverse-story-${projectId}-characters.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function edit(characterId: string, changes: Partial<StoryCharacter>) {
    setCharacters((current) => current.map((character) =>
      character.id === characterId ? { ...character, ...changes } : character,
    ));
  }

  return (
    <section className="my-8 rounded-2xl border border-zinc-800 p-5"
      aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="text-xl font-semibold">Your characters</h2>
      <p className="mt-2 text-sm text-zinc-400">
        Keep names, roles, descriptions, and portraits together.
        Character profiles save separately from your chapters.
      </p>
      {error && <p role="alert" className="mt-4 text-red-300">{error}</p>}
      {notice && <p role="status" className="mt-4 text-emerald-300">{notice}</p>}
      {loading ? <p role="status" className="mt-4">Loading characters...</p> : (
        <>
          {error && version === 0 && !dirty && (
            <button type="button" className={`${button} mt-3`}
              onClick={() => setRetry((value) => value + 1)}>Retry loading</button>
          )}
          <div className="my-5 flex flex-wrap items-center gap-3">
            <button type="button" className={button} disabled={busy || characters.length >= 100}
              onClick={() => setCharacters((current) => [...current, {
                id: crypto.randomUUID(), name: "", role: "",
                description: "", portrait_image_id: null,
              }])}>+ Add character</button>
            <button type="button" className={`${button} bg-violet-600`}
              disabled={busy || !dirty} onClick={() => void save()}>
              {busy ? "Please wait..." : "Save characters"}
            </button>
            <button type="button" className={button} disabled={busy}
              onClick={() => void latest()}>Load latest profiles</button>
            <button type="button" className={button} disabled={busy}
              onClick={exportDraft}>Export character draft</button>
            <span className="text-sm text-zinc-400">
              {dirty ? "Unsaved character changes" : version ? `Saved version ${version}` : "No profiles saved yet"}
            </span>
          </div>
          <div className="mb-5 rounded-xl border border-zinc-800 p-4">
            <p className="text-sm text-zinc-400">
              Upload portraits in the image library above, then refresh these choices.
              Portrait menus show one library page at a time.
            </p>
            {imageError && <p role="alert" className="mt-2 text-red-300">{imageError}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className={button} disabled={busy || imagesLoading}
                onClick={() => setImageRefresh((value) => value + 1)}>Refresh portraits</button>
              <button type="button" className={button}
                disabled={busy || imagesLoading || imageOffset === 0}
                onClick={() => setImageOffset((value) => Math.max(0, value - 20))}>Previous images</button>
              <span className="text-xs text-zinc-400">
                {imagesLoading ? "Loading portraits..." : `Image page ${imageOffset / 20 + 1}`}
              </span>
              <button type="button" className={button}
                disabled={busy || imagesLoading || !images?.has_more}
                onClick={() => setImageOffset((value) => value + 20)}>Next images</button>
            </div>
          </div>
          {characters.length === 0 && <p className="text-zinc-400">Add your first character to begin.</p>}
          <div className="grid gap-5 lg:grid-cols-2">
            {characters.map((character, index) => {
              const prefix = `${id}-${character.id}`;
              const linkedOnPage = images?.items.some((image) => image.id === character.portrait_image_id);
              return (
                <fieldset key={character.id} disabled={busy}
                  className="min-w-0 rounded-xl border border-zinc-800 p-4">
                  <legend className="px-2 font-medium">Character {index + 1}</legend>
                  <label htmlFor={`${prefix}-name`}>Name</label>
                  <input id={`${prefix}-name`} className={input} maxLength={150}
                    value={character.name} onChange={(event) => edit(character.id, { name: event.target.value })} />
                  <label htmlFor={`${prefix}-role`} className="mt-4 block">Role</label>
                  <input id={`${prefix}-role`} className={input} maxLength={150}
                    placeholder="Protagonist, rival, mentor..."
                    value={character.role} onChange={(event) => edit(character.id, { role: event.target.value })} />
                  <label htmlFor={`${prefix}-description`} className="mt-4 block">Description</label>
                  <textarea id={`${prefix}-description`} className={input} rows={5} maxLength={10000}
                    placeholder="Appearance, personality, motivation, background..."
                    value={character.description}
                    onChange={(event) => edit(character.id, { description: event.target.value })} />
                  <label htmlFor={`${prefix}-portrait`} className="mt-4 block">Portrait</label>
                  <select id={`${prefix}-portrait`} className={input}
                    disabled={imagesLoading} value={character.portrait_image_id ?? ""}
                    onChange={(event) => edit(character.id, {
                      portrait_image_id: event.target.value ? Number(event.target.value) : null,
                    })}>
                    <option value="">No portrait</option>
                    {character.portrait_image_id !== null && !linkedOnPage && (
                      <option value={character.portrait_image_id}>
                        Linked image #{character.portrait_image_id} (outside this page or unavailable)
                      </option>
                    )}
                    {images?.items.map((image) => (
                      <option key={image.id} value={image.id}>{image.label} / {image.category}</option>
                    ))}
                  </select>
                  {character.portrait_image_id !== null && (
                    <ProjectImage projectId={projectId} imageId={character.portrait_image_id}
                      alt={`${character.name || "Character"} portrait`}
                      className="mt-4 h-48 w-full rounded-lg bg-black object-contain" />
                  )}
                  <button type="button" className={`${button} mt-4 text-red-300`}
                    onClick={() => {
                      if (window.confirm("Remove this character from your draft? Export first to keep a copy.")) {
                        setCharacters((current) => current.filter((item) => item.id !== character.id));
                      }
                    }}>Remove character</button>
                </fieldset>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
