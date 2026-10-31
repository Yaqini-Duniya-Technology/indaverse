"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ProjectImage from "@/components/ProjectImage";
import { getProject, type Project } from "@/lib/projects";
import { getStory, type SavedStory } from "@/lib/story";
import styles from "./reader.module.css";

export default function StoryReaderPage() {
  const params = useParams();
  const projectId = Number(params.id);
  return <StoryReader key={projectId} projectId={projectId} />;
}

function StoryReader({ projectId }: { projectId: number }) {
  const [project, setProject] = useState<Project | null>(null);
  const [story, setStory] = useState<SavedStory | null>(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [fontSize, setFontSize] = useState(20);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusChapter = useRef(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      setProject(null);
      setStory(null);
      try {
        if (!Number.isSafeInteger(projectId) || projectId < 1) {
          throw new Error("Invalid project ID.");
        }
        const current = await getProject(projectId);
        if (current.project_type !== "story") {
          throw new Error("Open the reader from a story project.");
        }
        const saved = await getStory(projectId);
        if (!active) return;
        setProject(current);
        setStory(saved);
        setSelected((value) => saved?.chapters.some((chapter) => chapter.id === value)
          ? value : saved?.chapters[0]?.id || "");
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
    if (!focusChapter.current) return;
    focusChapter.current = false;
    heading.current?.focus();
  }, [selected]);

  function choose(chapterId: string) {
    if (chapterId === selected) {
      heading.current?.focus();
      return;
    }
    focusChapter.current = true;
    setSelected(chapterId);
  }

  const index = story?.chapters.findIndex((chapter) => chapter.id === selected) ?? -1;
  const chapter = index >= 0 ? story?.chapters[index] : null;

  return (
    <main className={styles.page} data-theme={theme}>
      <a className={styles.skip} href="#reading">Skip to reading</a>
      <div className={styles.container}>
        <nav className={styles.navigation} aria-label="Reader navigation">
          <Link href={`/projects/${projectId}`}>Back to project</Link>
          <Link href={`/projects/${projectId}/story`}>Edit in Story Studio</Link>
        </nav>

        {loading ? <p role="status" className={styles.message}>Opening your saved story...</p> : error ? (
          <section className={styles.message}>
            <h1>Unable to open story</h1>
            <p role="alert">{error}</p>
            <button className={styles.button} onClick={() => setRetry((value) => value + 1)}>Retry</button>
          </section>
        ) : project && (
          <>
            <header className={styles.header}>
              {typeof project.cover_image_id === "number" && (
                <ProjectImage projectId={projectId} imageId={project.cover_image_id}
                  alt={`Cover for ${story?.title || project.name}`} className={styles.cover} />
              )}
              <div>
                <p className={styles.eyebrow}>INDAVERSE / PRIVATE STORY PREVIEW</p>
                <h1>{story?.title || project.name}</h1>
                {story?.genre && <p className={styles.genre}>{story.genre}</p>}
                {story?.synopsis && <p className={styles.synopsis}>{story.synopsis}</p>}
                <p className={styles.muted}>
                  {story ? `Saved version ${story.version}. Save studio edits before refreshing this preview.`
                    : "Save your first story draft in Story Studio to preview it here."}
                </p>
              </div>
            </header>

            {!story || story.chapters.length === 0 ? (
              <section id="reading" className={styles.message}>
                <h2>No saved chapters yet</h2>
                <p>Add chapters and save your story to begin reading.</p>
                <Link className={styles.button} href={`/projects/${projectId}/story`}>Open Story Studio</Link>
              </section>
            ) : (
              <>
                <div className={styles.controls} aria-label="Reading controls">
                  <label htmlFor="reader-size">
                    Text size
                    <select id="reader-size" value={fontSize}
                      onChange={(event) => setFontSize(Number(event.target.value))}>
                      <option value={18}>Small</option>
                      <option value={20}>Medium</option>
                      <option value={24}>Large</option>
                    </select>
                  </label>
                  <button className={styles.button} onClick={() => setTheme(
                    (current) => current === "dark" ? "light" : "dark",
                  )}>Use {theme === "dark" ? "light" : "dark"} theme</button>
                  <button className={styles.button}
                    onClick={() => setRetry((value) => value + 1)}>Refresh saved story</button>
                </div>

                <div className={styles.layout}>
                  <nav className={styles.contents} aria-label="Chapters">
                    <h2>Contents</h2>
                    <ol>
                      {story.chapters.map((item, chapterIndex) => (
                        <li key={item.id}>
                          <button aria-current={item.id === selected ? "true" : undefined}
                            onClick={() => choose(item.id)}>
                            {chapterIndex + 1}. {item.title}
                          </button>
                        </li>
                      ))}
                    </ol>
                  </nav>
                  <article id="reading" className={styles.reading}>
                    {chapter && (
                      <>
                        <p className={styles.eyebrow}>CHAPTER {index + 1} OF {story.chapters.length}</p>
                        <h2 ref={heading} tabIndex={-1}>{chapter.title}</h2>
                        <div className={styles.text} style={{ fontSize }}>
                          {chapter.content.trim() ? chapter.content : (
                            <p className={styles.muted}>This saved chapter has no text yet.</p>
                          )}
                        </div>
                        <div className={styles.chapterNavigation}>
                          <button className={styles.button} disabled={index === 0}
                            onClick={() => choose(story.chapters[index - 1].id)}>Previous chapter</button>
                          <button className={styles.button} disabled={index === story.chapters.length - 1}
                            onClick={() => choose(story.chapters[index + 1].id)}>Next chapter</button>
                        </div>
                      </>
                    )}
                  </article>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
