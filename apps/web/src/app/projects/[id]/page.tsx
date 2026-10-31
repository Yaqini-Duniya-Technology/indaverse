"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getCurrentUser, type User } from "@/lib/auth";
import { getProject, type Project, type ProjectType } from "@/lib/projects";
import ProjectDetailsEditor from "./ProjectDetailsEditor";
import ProjectPlanEditor from "./ProjectPlanEditor";

import ProjectImages from "@/components/ProjectImages";
import ProjectImage from "@/components/ProjectImage";
import styles from "./workspace.module.css";

const studios: Partial<Record<ProjectType, {
  name: string; route: string; description: string;
}>> = {
  music: {
    name: "Music Studio", route: "music",
    description: "Write lyrics, organise audio and revisit saved song versions.",
  },
  video: {
    name: "Video Studio", route: "video",
    description: "Develop your script, plan shots and preview your storyboard.",
  },
  music_video: {
    name: "Video Studio", route: "video",
    description: "Plan your music video with scripts, shots and image references.",
  },
  story: {
    name: "Story Studio", route: "story",
    description: "Develop chapters, characters and scenes, then read your saved story.",
  },
  game: {
    name: "Game Studio", route: "game",
    description: "Design 2D and 3D worlds, edit layouts and test browser prototypes.",
  },
  website: {
    name: "Web & App Studio", route: "software",
    description: "Define pages, content sections and software requirements.",
  },
  app: {
    name: "Web & App Studio", route: "software",
    description: "Plan your app's screens, content and product features.",
  },
};

export default function ProjectWorkspacePage() {
  const params = useParams();
  const id = Number(params.id);
  return <Workspace key={String(params.id)} projectId={id} />;
}

function Workspace({ projectId }: { projectId: number }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    async function load() {
      try {
        if (!Number.isSafeInteger(projectId) || projectId < 1) {
          throw new Error("Invalid project ID.");
        }
        const [currentUser, currentProject] = await Promise.all([
          getCurrentUser(), getProject(projectId),
        ]);
        if (!active) return;
        setUser(currentUser);
        setProject(currentProject);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
        } else {
          setError(err instanceof Error ? err.message : "Unable to load project.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => { active = false; };
  }, [projectId, retry, router]);

  function detailsSaved(updated: Project) {
    setProject((current) => current ? {
      ...current, name: updated.name, description: updated.description,
      updated_at: updated.updated_at,
    } : updated);
  }

  function coverChanged(updated: Project) {
    setProject((current) => current ? {
      ...current, cover_image_id: updated.cover_image_id,
      cover_version: updated.cover_version,
    } : updated);
  }

  if (loading) {
    return (
      <main className={styles.loading}>
        <p role="status">Opening your project workspace...</p>
      </main>
    );
  }

  if (error || !project) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <Link href="/dashboard" className={styles.back}>Back to dashboard</Link>
          <section className={styles.panel}>
            <h1>Unable to open project</h1>
            <p role="alert">{error || "Project unavailable."}</p>
            <button className={styles.primary}
              onClick={() => setRetry((value) => value + 1)}>Retry</button>
          </section>
        </div>
      </main>
    );
  }

  const studio = studios[project.project_type];
  const studioUrl = studio ? `/projects/${project.id}/${studio.route}` : null;

  return (
    <div className={styles.page}>
      <a href="#project-main" className={styles.skip}>Skip to project</a>
      <nav className={styles.nav} aria-label="Project navigation">
        <Link href="/dashboard" className={styles.brand}>
          <span aria-hidden="true">IV</span> IndaVerse
        </Link>
        <span className={styles.owner}>{user?.username}</span>
      </nav>

      <main id="project-main" className={styles.container}>
        <Link href="/dashboard" className={styles.back}>? Back to dashboard</Link>

        <header className={styles.hero}>
          <div>
            <div className={styles.badges}>
              <span>{project.project_type.replaceAll("_", " ")}</span>
              <span>{project.visibility}</span>
              <span>Project #{project.id}</span>
            </div>
            <p className={styles.eyebrow}>YOUR CREATIVE WORKSPACE</p>
            <h1>{project.name}</h1>
            <p className={styles.description}>
              {project.description || "Give your idea direction, gather its assets and develop it in your studio."}
            </p>
            {typeof project.cover_image_id === "number" && (
              <div style={{ marginTop: 24, maxWidth: 560 }}>
                <ProjectImage projectId={project.id}
                  imageId={project.cover_image_id}
                  alt={`Cover for ${project.name}`} />
              </div>
            )}
          </div>
          {studioUrl && (
            <Link href={studioUrl} className={styles.primary}>
              Open {studio?.name} ?
            </Link>
          )}
        </header>

        <section className={styles.shortcuts} aria-label="Project tools">
          {studioUrl ? (
            <Link href={studioUrl}
              className={`${styles.shortcut} ${styles.highlight}`}>
              <span className={styles.symbol} aria-hidden="true">?</span>
              <h2>{studio?.name} <span aria-hidden="true">?</span></h2>
              <p>{studio?.description}</p>
            </Link>
          ) : (
            <div className={styles.shortcut}>
              <h2>Voice workspace</h2>
              <p>Dedicated voice studio tools are still in development.</p>
            </div>
          )}
          <a href="#project-images" className={styles.shortcut}>
            <span className={styles.symbol} aria-hidden="true">?</span>
            <h2>Images &amp; cover <span aria-hidden="true">?</span></h2>
            <p>Upload reference images, choose a cover and manage image requests.</p>
          </a>
          <a href="#project-plan" className={styles.shortcut}>
            <span className={styles.symbol} aria-hidden="true">?</span>
            <h2>Plan &amp; review <span aria-hidden="true">?</span></h2>
            <p>Turn your brief into steps, link assets and track refinements.</p>
          </a>
        </section>

        <ProjectDetailsEditor project={project} onSaved={detailsSaved} />


        <section id="project-images" style={{ scrollMarginTop: 24 }}>
          <ProjectImages projectId={project.id} onCoverChanged={coverChanged} />
        </section>

        <section id="project-plan" style={{ marginTop: 28, scrollMarginTop: 24 }}>
          <ProjectPlanEditor projectId={project.id} />
        </section>

        <footer className={styles.footer}>
          IndaVerse ? Developed by Yaqini &amp; Duniya Technology.
        </footer>
      </main>
    </div>
  );
}
