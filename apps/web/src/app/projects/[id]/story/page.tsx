"use client";

import Link from "next/link";
import StudioWorkbench from "@/components/StudioWorkbench";
import DraftExchange from "@/components/DraftExchange";
import ProjectImages from "@/components/ProjectImages";
import StoryCharactersEditor from "@/components/StoryCharactersEditor";
import StoryScenesEditor from "@/components/StoryScenesEditor";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getProject } from "@/lib/projects";
import { getStory, saveStory, type StoryDraft } from "@/lib/story";

const input = "mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-white focus:outline-none focus:ring-2 focus:ring-violet-400";
const button = "rounded-xl border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-40";
function words(text: string) {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

export default function StoryStudioPage() {
  const params = useParams();
  const projectId = Number(params.id);
  return <StoryEditor key={projectId} projectId={projectId} />;
}

function StoryEditor({ projectId }: { projectId: number }) {
  const [draft, setDraft] = useState<StoryDraft | null>(null);
  const [baseline, setBaseline] = useState("");
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  const [characterState, setCharacterState] = useState({ dirty: false, busy: false });
  const [sceneState, setSceneState] = useState({ dirty: false, busy: false });
  const dirty = draft !== null && JSON.stringify(draft) !== baseline;

  function apply(value: StoryDraft, savedVersion: number) {
    const next = {
      title: value.title, synopsis: value.synopsis,
      genre: value.genre, chapters: value.chapters,
    };
    setDraft(next);
    setBaseline(JSON.stringify(next));
    setVersion(savedVersion);
    setSelected((current) => next.chapters.some((item) => item.id === current)
      ? current : next.chapters[0]?.id || "");
  }

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        if (!Number.isSafeInteger(projectId) || projectId < 1) throw new Error("Invalid project ID.");
        const project = await getProject(projectId);
        if (project.project_type !== "story") throw new Error("Open this studio from a story project.");
        const saved = await getStory(projectId);
        if (active) apply(saved || {
          title: project.name, synopsis: "", genre: "", chapters: [],
        }, saved?.version || 0);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load story.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [projectId, retry]);

  useEffect(() => {
    if (!dirty && !busy && !characterState.dirty && !characterState.busy && !sceneState.dirty && !sceneState.busy) return;
    function unload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    function navigate(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.download || anchor.target === "_blank") return;
      const next = new URL(anchor.href);
      const current = new URL(window.location.href);
      if (next.origin === current.origin && next.pathname === current.pathname &&
          next.search === current.search) return;
      if (busy || characterState.busy || sceneState.busy || !window.confirm("Leave with unsaved story, character, or scene changes? Export each draft first to keep a copy.")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty, busy, characterState.dirty, characterState.busy, sceneState.dirty, sceneState.busy]);

  async function save() {
    if (!draft || lock.current) return;
    if (!draft.title.trim() || draft.chapters.some((item) => !item.title.trim())) {
      setError("Give the story and each chapter a title.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await saveStory(projectId, version, draft);
      apply(result, result.version);
      setNotice("Story saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save story.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function latest() {
    if (lock.current) return;
    if (dirty && !window.confirm("Replace your draft with the saved story? Export your draft first to keep it.")) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await getStory(projectId);
      if (!saved) throw new Error("No saved story exists. Your draft has been kept.");
      apply(saved, saved.version);
      setNotice("Latest saved story loaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load saved story.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function exportDraft() {
    if (!draft) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({
      project_id: projectId, expected_version: version, ...draft,
    }, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `indaverse-story-${projectId}-draft.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const chapter = draft?.chapters.find((item) => item.id === selected);
  function editChapter(field: "title" | "content", value: string) {
    setDraft((current) => current ? {
      ...current,
      chapters: current.chapters.map((item) => item.id === selected
        ? { ...item, [field]: value } : item),
    } : current);
  }
  function move(direction: number) {
    if (!draft || busy) return;
    const index = draft.chapters.findIndex((item) => item.id === selected);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= draft.chapters.length) return;
    const chapters = [...draft.chapters];
    [chapters[index], chapters[target]] = [chapters[target], chapters[index]];
    setDraft({ ...draft, chapters });
  }

  return (
    <main className="min-h-screen bg-black px-5 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <Link href={`/projects/${projectId}`} className="text-sm text-zinc-400 hover:text-white">
          &larr; Project workspace
        </Link>
        <div className="mt-4">
          <Link href={`/projects/${projectId}/story/read`}
            className="text-sm text-violet-300 hover:underline">
            Preview saved story &rarr;
          </Link>
          <p className="mt-1 text-xs text-zinc-500">Save your chapters before previewing.</p>
        </div>
        <header className="my-8">
          <p className="text-xs tracking-widest text-violet-300">INDAVERSE / STORY STUDIO</p>
          <h1 className="mt-3 text-4xl font-semibold">A place for your next story.</h1>
          <p className="mt-3 text-zinc-400">Build your chapters, find your voice, and keep your draft together.</p>
        </header>
        {draft && !loading && <DraftExchange studio="story" projectId={projectId} data={draft} version={version} dirty={dirty} disabled={busy || characterState.busy || sceneState.busy}
          onApply={next => {
            if (lock.current || busy || characterState.busy || sceneState.busy) return false;
            setDraft(next); setSelected(next.chapters[0]?.id ?? "");
            setNotice("Reviewed draft applied. Save manually when ready."); return true;
          }} />}
        {draft && !loading && <StudioWorkbench kind="story" projectId={projectId} data={draft} version={version} dirty={dirty} />}
        {draft && !loading && <ProjectImages key={`story-images:${projectId}`} projectId={projectId} />}
        {draft && !loading && <StoryCharactersEditor key={`story-characters:${projectId}`} projectId={projectId} onStateChanged={setCharacterState} />}
        {draft && !loading && <StoryScenesEditor key={`story-scenes:${projectId}`} projectId={projectId} onStateChanged={setSceneState} />}
        {error && <p role="alert" className="my-4 rounded-xl border border-red-900 p-4 text-red-300">{error}</p>}
        {notice && <p role="status" className="my-4 text-emerald-300">{notice}</p>}
        {loading ? <p role="status">Opening Story Studio...</p> : !draft ? (
          <button className={button} onClick={() => setRetry((value) => value + 1)}>Retry loading</button>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <button className={`${button} bg-violet-600`} disabled={busy || (!dirty && version > 0)}
                onClick={() => void save()}>{busy ? "Please wait..." : "Save story"}</button>
              <button className={button} disabled={busy} onClick={() => void latest()}>Load latest</button>
              <button className={button} disabled={busy} onClick={exportDraft}>Export draft</button>
              <span className="text-sm text-zinc-400">
                {dirty ? "Unsaved changes" : version ? `Saved version ${version}` : "Not saved yet"}
                {" / "}{draft.chapters.reduce((sum, item) => sum + words(item.content), 0)} words
              </span>
            </div>
            <fieldset disabled={busy} className="rounded-2xl border border-zinc-800 p-5">
              <legend className="px-2 font-medium">Story details</legend>
              <label htmlFor="story-title">Title</label>
              <input id="story-title" className={input} maxLength={150} value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              <label htmlFor="story-genre" className="mt-4 block">Genre</label>
              <input id="story-genre" className={input} maxLength={100} value={draft.genre}
                placeholder="Adventure, romance, mystery..."
                onChange={(event) => setDraft({ ...draft, genre: event.target.value })} />
              <label htmlFor="story-synopsis" className="mt-4 block">Synopsis</label>
              <textarea id="story-synopsis" className={input} rows={3} maxLength={10000}
                value={draft.synopsis} placeholder="What is your story about?"
                onChange={(event) => setDraft({ ...draft, synopsis: event.target.value })} />
            </fieldset>
            <div className="mt-6 grid gap-6 md:grid-cols-[260px_1fr]">
              <aside className="rounded-2xl border border-zinc-800 p-5">
                <h2 className="text-lg font-semibold">Chapters</h2>
                <button className={`${button} my-4 w-full`} disabled={busy || draft.chapters.length >= 100}
                  onClick={() => {
                    const id = crypto.randomUUID();
                    setDraft({ ...draft, chapters: [...draft.chapters, {
                      id, title: `Chapter ${draft.chapters.length + 1}`, content: "",
                    }] });
                    setSelected(id);
                  }}>+ Add chapter</button>
                <ol className="space-y-2">
                  {draft.chapters.map((item, index) => (
                    <li key={item.id}>
                      <button className={`w-full rounded-xl p-3 text-left ${selected === item.id ? "bg-violet-950" : "bg-zinc-950"}`}
                        disabled={busy} aria-pressed={selected === item.id}
                        onClick={() => setSelected(item.id)}>
                        <span className="block break-words">{index + 1}. {item.title || "Untitled"}</span>
                        <span className="text-xs text-zinc-400">{words(item.content)} words</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </aside>
              {chapter ? (
                <fieldset disabled={busy} className="min-w-0 rounded-2xl border border-zinc-800 p-5">
                  <legend className="px-2 font-medium">Chapter editor</legend>
                  <div className="mb-4 flex flex-wrap gap-2">
                    <button className={button} disabled={draft.chapters[0]?.id === selected}
                      onClick={() => move(-1)}>Move up</button>
                    <button className={button} disabled={draft.chapters.at(-1)?.id === selected}
                      onClick={() => move(1)}>Move down</button>
                    <button className={`${button} text-red-300`} onClick={() => {
                      if (!window.confirm("Remove this chapter from your draft? Export first to keep a copy.")) return;
                      const chapters = draft.chapters.filter((item) => item.id !== selected);
                      setDraft({ ...draft, chapters });
                      setSelected(chapters[0]?.id || "");
                    }}>Remove chapter</button>
                  </div>
                  <label htmlFor="chapter-title">Chapter title</label>
                  <input id="chapter-title" className={input} maxLength={150} value={chapter.title}
                    onChange={(event) => editChapter("title", event.target.value)} />
                  <label htmlFor="chapter-content" className="mt-4 block">Your story</label>
                  <textarea id="chapter-content" className={`${input} min-h-96 leading-8`}
                    rows={16} maxLength={100000} value={chapter.content}
                    placeholder="Start with a moment your reader will remember."
                    onChange={(event) => editChapter("content", event.target.value)} />
                  <p className="mt-3 text-sm text-zinc-400">{words(chapter.content)} words in this chapter</p>
                </fieldset>
              ) : <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-zinc-400">
                Add your first chapter to begin writing.
              </div>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
