"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getCurrentUser, logoutUser, type User } from "@/lib/auth";
import {
  createProject, getProjects,
  type Project, type ProjectType,
} from "@/lib/projects";
import styles from "./dashboard.module.css";

const projectTypes: { value: ProjectType; label: string }[] = [
  { value: "music", label: "Music" },
  { value: "video", label: "Video" },
  { value: "music_video", label: "Music video" },
  { value: "story", label: "Story / novel" },
  { value: "game", label: "2D / 3D game" },
  { value: "website", label: "Website" },
  { value: "app", label: "App" },
];

const studios: {
  title: string; icon: string; type: ProjectType;
  description: string; detail: string;
}[] = [
  {
    title: "Music Studio", icon: "?", type: "music",
    description: "Write lyrics, shape your sound and organise audio.",
    detail: "Song history and generation request tracking. AI audio generation awaits a connected provider.",
  },
  {
    title: "Video Studio", icon: "?", type: "video",
    description: "Develop scripts, plan shots and preview your storyboard.",
    detail: "Saved drafts, image references and revision history.",
  },
  {
    title: "Story Studio", icon: "?", type: "story",
    description: "Build characters, scenes, chapters and your next novel.",
    detail: "Writing workspace, image references and a private reading preview.",
  },
  {
    title: "Web & App Studio", icon: "?", type: "website",
    description: "Plan pages, content sections and product features.",
    detail: "Saved software blueprints and design previews.",
  },
  {
    title: "Game Studio", icon: "?", type: "game",
    description: "Design characters, levels and worlds in 2D or 3D.",
    detail: "Blueprints, visual layout tools and browser prototype testing.",
  },
];

function typeLabel(type: string) {
  return projectTypes.find((item) => item.value === type)?.label
    ?? type.replaceAll("_", " ");
}

function studioPath(project: Project): string | null {
  const routes: Partial<Record<ProjectType, string>> = {
    music: "music", video: "video", music_video: "video",
    story: "story", website: "software", app: "software", game: "game",
  };
  const route = routes[project.project_type];
  return route ? `/projects/${project.id}/${route}` : null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("music");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const createLock = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const current = await getCurrentUser();
        if (!active) return;
        setUser(current);
        const saved = await getProjects();
        if (active) setProjects(saved);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
        } else {
          setError(err instanceof Error ? err.message : "Unable to load your workspace.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [router, retry]);

  useEffect(() => {
    if (showCreate) nameInput.current?.focus();
  }, [showCreate]);

  function openCreate(type: ProjectType = "music") {
    if (creating) return;
    setProjectType(type);
    setCreateError("");
    setShowCreate(true);
    window.setTimeout(() => {
      document.getElementById("create-project")?.scrollIntoView({
        behavior: "smooth", block: "center",
      });
      nameInput.current?.focus();
    }, 0);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createLock.current) return;
    if (!name.trim()) {
      setCreateError("Give your project a name.");
      nameInput.current?.focus();
      return;
    }
    createLock.current = true;
    setCreating(true);
    setCreateError("");
    try {
      const project = await createProject({
        name: name.trim(),
        project_type: projectType,
        description: description.trim() || undefined,
        visibility: "private",
      });
      setProjects((current) => [project, ...current]);
      setName("");
      setDescription("");
      setShowCreate(false);
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Unable to create your project.");
    } finally {
      createLock.current = false;
      setCreating(false);
    }
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logoutUser();
      router.replace("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign out. Please try again.");
      setSigningOut(false);
    }
  }

  const query = search.trim().toLowerCase();
  const visible = projects.filter((project) => {
    const matchesType = filter === "all" || project.project_type === filter;
    const matchesSearch = `${project.name} ${project.description ?? ""}`
      .toLowerCase().includes(query);
    return matchesType && matchesSearch;
  });

  if (loading) {
    return <main className={styles.loading}><p role="status">Opening your creative workspace...</p></main>;
  }

  if (!user) {
    return (
      <main className={styles.loading}>
        <div>
          <h1>Unable to open IndaVerse</h1>
          <p role="alert">{error || "Please sign in to continue."}</p>
          <button className={styles.primary} onClick={() => setRetry((value) => value + 1)}>Retry</button>
          <Link className={styles.secondary} href="/login">Sign in</Link>
        </div>
      </main>
    );
  }

  return (
    <div className={styles.workspace}>
      <a href="#workspace-main" className={styles.skip}>Skip to workspace</a>
      <aside className={styles.sidebar}>
        <Link href="/dashboard" className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">IV</span> IndaVerse
        </Link>
        <p className={styles.eyebrow}>YOUR CREATIVE WORKSPACE</p>
        <nav className={styles.navigation} aria-label="Workspace navigation">
          <Link href="/dashboard" aria-current="page">Overview</Link>
          <a href="#studios">Creative studios</a>
          <a href="#projects">My projects</a>
        </nav>
        <button className={styles.primary} onClick={() => openCreate()}>+ New project</button>
        <div className={styles.sidebarNote}>
          <p className={styles.eyebrow}>FROM IDEA TO SOMETHING REAL</p>
          <p>Keep your creative direction, drafts and project assets together.</p>
        </div>
        <div className={styles.account}>
          <span className={styles.avatar} aria-hidden="true">
            {user.username.slice(0, 1).toUpperCase()}
          </span>
          <div><strong>{user.username}</strong><small>Creator workspace</small></div>
        </div>
      </aside>

      <main id="workspace-main" className={styles.main}>
        <header className={styles.topbar}>
          <p className={styles.eyebrow}>CREATOR DASHBOARD</p>
          <button className={styles.secondary} disabled={signingOut} onClick={() => void signOut()}>
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </header>

        {error && (
          <div role="alert" className={styles.error}>
            <p>{error}</p>
            <button className={styles.secondary} onClick={() => setRetry((value) => value + 1)}>Retry workspace</button>
          </div>
        )}

        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>WELCOME, {user.username.toUpperCase()}</p>
            <h1>Your ideas.<br />A universe of possibility.</h1>
            <p>Write a story, shape a song, plan a product or build the idea behind your next world.</p>
            <div className={styles.actions}>
              <button className={styles.primary} onClick={() => openCreate()}>Create a project</button>
              <a className={styles.secondary} href="#projects">Explore your projects</a>
            </div>
          </div>
          <div className={styles.art} aria-hidden="true">
            <div className={styles.orbit} />
            <div className={styles.wave}>
              {[35, 65, 95, 55, 125, 155, 90, 140, 110, 60, 95, 45].map((height, index) => (
                <span key={index} style={{ height }} />
              ))}
            </div>
            <span>CREATE YOUR UNIVERSE</span>
          </div>
        </section>

        {showCreate && (
          <section id="create-project" className={styles.createPanel} aria-labelledby="create-heading">
            <h2 id="create-heading">Start something new</h2>
            <p>Your project starts private. Choose its studio and give it a name.</p>
            <form onSubmit={handleCreate}>
              <fieldset disabled={creating}>
                <label htmlFor="project-name">Project name
                  <input ref={nameInput} id="project-name" required maxLength={150}
                    value={name} onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Legends of Zamara" />
                </label>
                <label htmlFor="project-type">Project type
                  <select id="project-type" value={projectType}
                    onChange={(event) => setProjectType(event.target.value as ProjectType)}>
                    {projectTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label htmlFor="project-description">Description (optional)
                  <input id="project-description" maxLength={5000}
                    value={description} onChange={(event) => setDescription(event.target.value)}
                    placeholder="What would you like to create?" />
                </label>
                {createError && <p role="alert" className={styles.error}>{createError}</p>}
                <div className={styles.actions}>
                  <button className={styles.primary} type="submit">
                    {creating ? "Creating..." : "Create project"}
                  </button>
                  <button className={styles.secondary} type="button" onClick={() => setShowCreate(false)}>Cancel</button>
                </div>
              </fieldset>
            </form>
          </section>
        )}

        <section id="studios" className={styles.section} aria-labelledby="studios-heading">
          <div className={styles.sectionHeading}>
            <h2 id="studios-heading">Your creative studios</h2>
            <p>Choose a starting point. Each studio opens through a project.</p>
          </div>
          <div className={styles.studioGrid}>
            {studios.map((studio) => (
              <article key={studio.type} className={`${styles.studio} ${studio.type === "music" ? styles.music : ""}`}>
                <div className={styles.cardTop}>
                  <span className={styles.studioIcon} aria-hidden="true">{studio.icon}</span>
                  <span className={styles.tag}>Studio available</span>
                </div>
                <h3>{studio.title}</h3>
                <p>{studio.description}</p>
                <small>{studio.detail}</small>
                <button className={styles.studioAction} onClick={() => openCreate(studio.type)}>
                  Create {typeLabel(studio.type).toLowerCase()} project ?
                </button>
              </article>
            ))}
          </div>
        </section>

        <section id="projects" className={styles.section} aria-labelledby="projects-heading">
          <div className={styles.sectionHeading}>
            <h2 id="projects-heading">My projects <span className={styles.count}>{projects.length}</span></h2>
            <p>Your saved ideas, drafts and creative work.</p>
          </div>
          <div className={styles.toolbar}>
            <label className={styles.search}>Search projects
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or description" />
            </label>
            <label className={styles.filter}>Project type
              <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option value="all">All projects</option>
                {projectTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                <option value="voice">Voice</option>
              </select>
            </label>
          </div>

          {error && projects.length === 0 ? (
            <div className={styles.empty}><p>Projects could not be loaded. Use Retry workspace above.</p></div>
          ) : visible.length === 0 ? (
            <div className={styles.empty}>
              <h3>{projects.length === 0 ? "Your next creation starts here." : "No matching projects."}</h3>
              <p>{projects.length === 0 ? "Create your first project to open a studio." : "Try another search or project type."}</p>
              {projects.length === 0 && <button className={styles.primary} onClick={() => openCreate()}>Create your first project</button>}
            </div>
          ) : (
            <div className={styles.projectGrid}>
              {visible.map((project) => {
                const studio = studioPath(project);
                return (
                  <article key={project.id} className={styles.project}>
                    <div className={styles.cardTop}>
                      <span className={styles.type}>{typeLabel(project.project_type)}</span>
                      <span className={styles.visibility}>{project.visibility}</span>
                    </div>
                    <h3>{project.name}</h3>
                    <p>{project.description || "Open this project to develop your creative direction."}</p>
                    <div className={styles.projectFooter}>
                      <span>Project #{project.id}</span>
                      <Link href={`/projects/${project.id}`}>Open project ?</Link>
                      {studio && <Link href={studio}>Open studio ?</Link>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        <footer className={styles.footer}>IndaVerse ? A creative platform in development by Yaqini &amp; Duniya Technology.</footer>
      </main>
    </div>
  );
}
