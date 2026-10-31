"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import ProjectImage from "@/components/ProjectImage";
import { getProject } from "@/lib/projects";
import { getVideo, type VideoProject } from "@/lib/video";
import styles from "./preview.module.css";

export default function StoryboardPreviewPage() {
  const params = useParams();
  return <StoryboardPreview key={String(params.id)} projectId={Number(params.id)} />;
}

function StoryboardPreview({ projectId }: { projectId: number }) {
  const [video, setVideo] = useState<VideoProject | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [empty, setEmpty] = useState(false);
  const [retry, setRetry] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusNext = useRef(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      setEmpty(false);
      setVideo(null);
      try {
        if (!Number.isSafeInteger(projectId) || projectId < 1) {
          throw new Error("Invalid project ID.");
        }
        const project = await getProject(projectId);
        if (!["video", "music_video"].includes(project.project_type)) {
          throw new Error("Open this preview from a video project.");
        }
        let saved;
        try {
          saved = await getVideo(projectId);
        } catch (err) {
          if (err instanceof Error && err.message === "No video draft saved yet.") {
            if (active) setEmpty(true);
            return;
          }
          throw err;
        }
        if (!active) return;
        setVideo(saved);
        setSelectedId((current) =>
          saved.shots.some((shot) => shot.id === current)
            ? current : saved.shots[0]?.id ?? "",
        );
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load storyboard.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [projectId, retry]);

  useEffect(() => {
    if (focusNext.current) {
      heading.current?.focus();
      focusNext.current = false;
    }
  }, [selectedId]);

  function selectShot(id: string) {
    if (id === selectedId) return;
    focusNext.current = true;
    setSelectedId(id);
  }

  const shots = video?.shots ?? [];
  const index = shots.findIndex((shot) => shot.id === selectedId);
  const shot = shots[index];
  const total = shots.reduce((sum, item) => sum + item.duration_seconds, 0);
  const start = shots.slice(0, Math.max(0, index))
    .reduce((sum, item) => sum + item.duration_seconds, 0);
  const timing = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <main className={styles.page}>
      <a className={styles.skip} href="#storyboard">Skip to storyboard</a>
      <div className={styles.container}>
        <nav className={styles.navigation} aria-label="Storyboard navigation">
          <Link href={`/projects/${projectId}`}>&larr; Project home</Link>
          <Link href={`/projects/${projectId}/video`}>Edit in Video Studio &rarr;</Link>
        </nav>

        {loading ? (
          <p className={styles.message} role="status" aria-busy="true">Opening your saved storyboard...</p>
        ) : error ? (
          <section className={styles.message}>
            <h1>Unable to load storyboard</h1>
            <p role="alert">{error}</p>
            <button className={styles.button} onClick={() => setRetry((value) => value + 1)}>Retry</button>
          </section>
        ) : empty ? (
          <section className={styles.message}>
            <h1>Your storyboard starts in Video Studio</h1>
            <p>Save a video draft, then return here to preview its script and shots.</p>
            <Link className={styles.button} href={`/projects/${projectId}/video`}>Open Video Studio</Link>
            <button className={styles.button} onClick={() => setRetry((value) => value + 1)}>Refresh saved video</button>
          </section>
        ) : video && (
          <>
            <header className={styles.header}>
              <p className={styles.eyebrow}>PRIVATE / SAVED STORYBOARD</p>
              <h1>{video.title}</h1>
              <p className={styles.muted}>
                {shots.length} shots / {timing(total)} planned / {video.aspect_ratio} / Version {video.version}
              </p>
              <p className={styles.muted}>Updated {new Date(video.updated_at).toLocaleString()}</p>
              <p className={styles.muted}>This previews saved planning material. It is not a rendered video or a public share page.</p>
            </header>
            <div className={styles.controls}>
              <button className={styles.button} onClick={() => setRetry((value) => value + 1)}>Refresh saved video</button>
              <span className={styles.muted}>Save editor changes before refreshing this preview.</span>
            </div>

            <div id="storyboard" className={styles.layout}>
              <aside className={styles.contents} aria-label="Shot list">
                <h2>Shot sequence</h2>
                {!shots.length && <p className={styles.muted}>No shots saved yet.</p>}
                <ol>
                  {shots.map((item, position) => (
                    <li key={item.id}>
                      <button aria-current={item.id === selectedId ? "true" : undefined}
                        onClick={() => selectShot(item.id)}>
                        <span>{String(position + 1).padStart(2, "0")} / {item.title}</span>
                        <small>{item.duration_seconds} seconds</small>
                      </button>
                    </li>
                  ))}
                </ol>
              </aside>

              <section className={styles.reading} aria-label="Selected shot">
                {shot ? (
                  <>
                    <p className={styles.eyebrow}>
                      SHOT {index + 1} / {shots.length} ? {timing(start)} TO {timing(start + shot.duration_seconds)}
                    </p>
                    <h2 ref={heading} tabIndex={-1}>{shot.title}</h2>
                    <div className={styles.frame} style={{ aspectRatio: video.aspect_ratio.replace(":", " / ") }}>
                      {shot.image_id !== null ? (
                        <ProjectImage projectId={projectId} imageId={shot.image_id}
                          alt={`Storyboard reference for ${shot.title}`} className={styles.image} />
                      ) : <p className={styles.muted}>No reference image linked to this shot.</p>}
                    </div>
                    <div className={styles.notes}>
                      <article><h3>Visual description</h3>
                        <p>{shot.description || "No visual description added yet."}</p>
                      </article>
                      <article><h3>Camera direction</h3>
                        <p>{shot.camera_direction || "No camera direction added yet."}</p>
                      </article>
                    </div>
                    <div className={styles.shotNavigation}>
                      <button className={styles.button} disabled={index <= 0}
                        onClick={() => { if (index > 0) selectShot(shots[index - 1].id); }}>
                        &larr; Previous shot
                      </button>
                      <span className={styles.muted}>{shot.duration_seconds} seconds planned</span>
                      <button className={styles.button} disabled={index >= shots.length - 1}
                        onClick={() => { if (index < shots.length - 1) selectShot(shots[index + 1].id); }}>
                        Next shot &rarr;
                      </button>
                    </div>
                  </>
                ) : (
                  <div className={styles.message}>
                    <h2>Add your first shot</h2>
                    <p>Your saved script is below. Open Video Studio to build its shot sequence.</p>
                  </div>
                )}
              </section>
            </div>

            <section className={styles.script} aria-labelledby="script-heading">
              <p className={styles.eyebrow}>THE SAVED SCRIPT</p>
              <h2 id="script-heading">Words behind the visuals</h2>
              <p>{video.script || "No script saved yet."}</p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
