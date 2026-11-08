"use client";

import { useEffect, useState } from "react";
import { apiDownload } from "@/lib/api";
import { getCharacters, type StoryCharacter } from "@/lib/storyCharacters";
import { getScenes, type StoryScene } from "@/lib/storyScenes";
import type { Chapter } from "@/lib/story";

export default function ManuscriptTools({projectId, version, chapters, dirty, control, onChapter}: {
  projectId: number; version: number; chapters: Chapter[]; dirty: boolean; control: string; onChapter: (id: string) => void;
}) {
  const [references, setReferences] = useState<{scenes: StoryScene[]; characters: StoryCharacter[]}>();
  const [review, setReview] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<{url: string; format: string; version: number}>();
  useEffect(() => () => { if (file) URL.revokeObjectURL(file.url); }, [file]);
  const chapterById = new Map(chapters.map(chapter => [chapter.id, chapter]));
  const characterById = new Map(references?.characters.map(character => [character.id, character]));
  const settings = new Map<string, StoryScene[]>();
  for (const scene of references?.scenes ?? []) {
    const name = scene.setting.trim() || "Unspecified setting";
    settings.set(name, [...(settings.get(name) ?? []), scene]);
  }
  const issues: {key: string; text: string; chapterId?: string}[] = [];
  const seen = new Set<string>();
  for (const chapter of chapters) {
    const title = chapter.title.trim().toLowerCase();
    if (!chapter.content.trim() && chapter.status === "complete") issues.push({
      key: `${chapter.id}-empty`, text: `“${chapter.title}” is marked complete but has no text.`, chapterId: chapter.id,
    });
    if (title && seen.has(title)) issues.push({
      key: `${chapter.id}-duplicate`, text: `Duplicate chapter title: “${chapter.title}”.`, chapterId: chapter.id,
    });
    if (title) seen.add(title);
  }
  for (const scene of references?.scenes ?? []) {
    const chapter = scene.chapter_id ? chapterById.get(scene.chapter_id) : undefined;
    if (!chapter) issues.push({key: `${scene.id}-chapter`, text: `“${scene.title}” has no chapter in this manuscript.`});
    if (!scene.setting.trim()) issues.push({key: `${scene.id}-setting`, text: `“${scene.title}” has no setting.`, chapterId: chapter?.id});
    if (scene.character_ids.some(id => !characterById.has(id))) issues.push({
      key: `${scene.id}-character`, text: `“${scene.title}” refers to a missing character.`, chapterId: chapter?.id,
    });
  }
  async function load() {
    setWorking(true); setError("");
    try {
      const [scenes, characters] = await Promise.all([getScenes(projectId), getCharacters(projectId)]);
      setReferences({scenes: scenes.scenes, characters: characters.characters});
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load saved references."); }
    finally { setWorking(false); }
  }
  function jump(id: string) {
    onChapter(id);
    window.requestAnimationFrame(() => document.getElementById("chapter-title")?.focus());
  }
  return <section className="my-5 space-y-4 rounded-2xl border border-zinc-800 p-4" aria-label="Manuscript tools">
    <h2 className="text-lg font-semibold">Manuscript tools</h2>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={control} disabled={working} onClick={() => void load()}>Load saved reference board</button>
      <button type="button" className={control} disabled={working} aria-expanded={review}
        onClick={() => {setReview(!review); if (!review && !references) void load();}}>Review continuity</button>
      {(["html", "epub"] as const).map(format => <button type="button" key={format} className={control}
        disabled={working || dirty || !version} onClick={async () => {
          setWorking(true); setError(""); setFile(undefined);
          try {
            const blob = await apiDownload(`/api/v1/projects/${projectId}/story/manuscript/${format}?version=${version}`,
              undefined, "application/octet-stream", format === "html" ? "text/html; charset=utf-8" : "application/epub+zip",
              AbortSignal.timeout(20000));
            setFile({url: URL.createObjectURL(blob), format, version});
          } catch (cause) {setError(cause instanceof Error ? cause.message : "Could not export the manuscript.");}
          finally {setWorking(false);}
        }}>Prepare {format.toUpperCase()} manuscript</button>)}
      {file && !dirty && file.version === version && <a className={control} href={file.url}
        download={`indaverse-manuscript-v${version}.${file.format}`}>Download {file.format.toUpperCase()} manuscript</a>}
    </div>
    {references && <div className="space-y-3">
      <h3 className="font-semibold">Character and setting board</h3>
      <p className="text-sm text-zinc-400">Based on your saved character and scene cards. Reload after saving changes to those cards.</p>
      {settings.size ? <ul className="space-y-3">{[...settings].map(([name, scenes]) => <li key={name}>
        <strong>{name}</strong>
        <ul className="pl-4">{scenes.map(scene => <li key={scene.id}>
          {scene.title} — {scene.character_ids.map(id => characterById.get(id)?.name ?? "Missing character").join(", ") || "No characters linked"}
          {scene.chapter_id && chapterById.has(scene.chapter_id) && <button type="button" className={`${control} ml-2`}
            onClick={() => jump(scene.chapter_id!)}>{chapterById.get(scene.chapter_id)?.title}</button>}
        </li>)}</ul>
      </li>)}</ul> : <p>No saved scenes yet.</p>}
      <p>Characters: {references.characters.map(character => character.name).join(", ") || "None saved"}</p>
    </div>}
    {review && <div className="space-y-2">
      <h3 className="font-semibold">Continuity review</h3>
      <p className="text-sm text-zinc-400">Checks chapter titles, empty completed chapters, and scene links. It does not judge the prose.</p>
      {issues.length ? <ul className="space-y-2">{issues.map(issue => <li key={issue.key}>{issue.text}
        {issue.chapterId && <button type="button" className={`${control} ml-2`} onClick={() => jump(issue.chapterId!)}>Open chapter</button>}
      </li>)}</ul> : <p>{references ? "No continuity issues found by these checks." : "Load saved references to finish the review."}</p>}
    </div>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
