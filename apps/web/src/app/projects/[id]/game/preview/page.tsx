"use client";

import Link from "next/link";
import ProjectImage from "@/components/ProjectImage";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getProject } from "@/lib/projects";
import { getGame, type GameProject } from "@/lib/game";
import styles from "../game.module.css";

export default function GamePreviewPage() {
  const params = useParams();
  return <Preview key={String(params.id)} projectId={Number(params.id)} />;
}

function Preview({ projectId }: { projectId: number }) {
  const [game, setGame] = useState<GameProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setGame(null);
      setError("");
      setEmpty(false);
      try {
        if (!Number.isSafeInteger(projectId) || projectId < 1) {
          throw new Error("Invalid project ID.");
        }
        const project = await getProject(projectId);
        if (project.project_type !== "game") {
          throw new Error("Open this preview from a game project.");
        }
        const saved = await getGame(projectId);
        if (active) setGame(saved);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404 &&
            err.message === "No game blueprint saved yet.") {
          setEmpty(true);
        } else {
          setError(err instanceof Error ? err.message : "Unable to load game design.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [projectId, retry]);

  const textStyle = {
    whiteSpace: "pre-wrap" as const,
    overflowWrap: "anywhere" as const,
    lineHeight: 1.85,
    marginTop: 12,
  };

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <nav className={styles.navigation} aria-label="Game preview navigation">
          <Link href={`/projects/${projectId}`}>Back to project</Link>
          <Link href={`/projects/${projectId}/game`}>Edit in Game Studio</Link>
        </nav>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>PRIVATE GAME DESIGN PREVIEW</p>
          <h1>{game?.title || "Your saved game design"}</h1>
          <p>Review your saved blueprint. Playable gameplay and asset generation come later.</p>
        </header>
        {loading ? <p aria-busy="true">Loading saved design...</p> : error ? (
          <section className={styles.panel}>
            <p className={styles.error} role="alert">{error}</p>
            <button className={styles.secondary} onClick={() => setRetry((value) => value + 1)}>Retry</button>
          </section>
        ) : empty ? (
          <section className={styles.panel}>
            <h2>No saved blueprint yet</h2>
            <p>Save your design in Game Studio, then return to preview it.</p>
            <Link className={styles.secondary} href={`/projects/${projectId}/game`}>Open Game Studio</Link>
          </section>
        ) : game ? (
          <>
            <div className={styles.toolbar}>
              <span>{game.dimension.toUpperCase()} / {game.genre || "Genre not set"} / Version {game.version}</span>
              <button className={styles.secondary} onClick={() => setRetry((value) => value + 1)}>Refresh saved design</button>
            </div>
            <p className={styles.footnote}>Updated {new Date(game.updated_at).toLocaleString()}. Unsaved changes are excluded.</p>
            <section className={styles.panel}>
              <h2>Game direction</h2>
              <h3>Concept</h3><p style={textStyle}>{game.concept || "Not set."}</p>
              <div className={styles.grid}>
                <div><h3>Core gameplay loop</h3><p style={textStyle}>{game.core_loop || "Not set."}</p></div>
                <div><h3>Controls</h3><p style={textStyle}>{game.controls || "Not set."}</p></div>
              </div>
            </section>
            <section className={styles.panel}>
              <h2>Characters ({game.characters.length})</h2>
              {!game.characters.length && <p>No characters saved.</p>}
              <div className={styles.grid}>
                {game.characters.map((item) => (
                  <article className={styles.card} key={item.id}>
                    <p className={styles.eyebrow}>{item.role}</p>
                    <h3>{item.name}</h3>
                    {item.image_id && <ProjectImage projectId={projectId}
                      imageId={item.image_id} alt={`Reference for ${item.name}`}
                      className="mt-4 h-48 w-full rounded-xl object-contain" />}
                    <p style={textStyle}>{item.description || "No description added."}</p>
                  </article>
                ))}
              </div>
            </section>
            <section className={styles.panel}>
              <h2>Level journey ({game.levels.length})</h2>
              {!game.levels.length && <p>No levels saved.</p>}
              {game.levels.length > 0 && (
                <nav className={styles.actions} aria-label="Saved levels">
                  {game.levels.map((item, index) => (
                    <a className={styles.secondary} key={item.id} href={`#level-${item.id}`}>
                      {index + 1}. {item.title}
                    </a>
                  ))}
                </nav>
              )}
              {game.levels.map((item, index) => (
                <article className={styles.card} key={item.id} id={`level-${item.id}`}
                  style={{ scrollMarginTop: 24 }}>
                  <p className={styles.eyebrow}>LEVEL {index + 1}</p>
                  <h3>{item.title}</h3>
                  {item.image_id && <ProjectImage projectId={projectId}
                    imageId={item.image_id} alt={`Reference for ${item.title}`}
                    className="mt-4 h-64 w-full rounded-xl object-contain" />}
                  <h4 className="mt-4 font-semibold">Setting</h4>
                  <p style={textStyle}>{item.setting || "Not set."}</p>
                  <h4 className="mt-4 font-semibold">Objective and win condition</h4>
                  <p style={textStyle}>{item.objective || "Not set."}</p>
                  <h4 className="mt-4 font-semibold">Challenges and failure conditions</h4>
                  <p style={textStyle}>{item.challenges || "Not set."}</p>
                </article>
              ))}
            </section>
            <section className={styles.panel}>
              <h2>Asset requirements ({game.assets.length})</h2>
              <p>These describe assets to create or gather.</p>
              {!game.assets.length && <p>No requirements saved.</p>}
              <div className={styles.grid}>
                {game.assets.map((item) => (
                  <article className={styles.card} key={item.id}>
                    <p className={styles.eyebrow}>{item.kind}</p>
                    <h3>{item.title}</h3>
                    <p style={textStyle}>{item.description || "No specifications added."}</p>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
