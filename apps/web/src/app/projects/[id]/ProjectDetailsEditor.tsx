"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { updateProject, type Project } from "@/lib/projects";
import styles from "./workspace.module.css";
import CreativeBriefEditor from "./CreativeBriefEditor";

export default function ProjectDetailsEditor({
  project,
  onSaved,
}: {
  project: Project;
  onSaved: (project: Project) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const saveLock = useRef(false);

  const dirty = editing && (
    name !== project.name ||
    description !== (project.description ?? "")
  );

  useEffect(() => {
    if (!dirty && !saving) return;

    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    function beforeNavigation(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const destination = new URL(anchor.href);
      const current = new URL(window.location.href);
      if (
        destination.origin === current.origin &&
        destination.pathname === current.pathname &&
        destination.search === current.search
      ) {
        return;
      }

      if (saving) {
        event.preventDefault();
        event.stopPropagation();
        window.alert("Please wait for the project details to finish saving.");
      } else if (!window.confirm("Leave without saving your project details?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigation, true);
    };
  }, [dirty, saving]);

  function startEditing() {
    setName(project.name);
    setDescription(project.description ?? "");
    setError("");
    setNotice("");
    setEditing(true);
  }

  function cancel() {
    if (saveLock.current) return;
    if (dirty && !window.confirm("Discard your project detail edits?")) return;
    setName(project.name);
    setDescription(project.description ?? "");
    setError("");
    setEditing(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveLock.current) return;

    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 150) {
      setError("Enter a project name between 1 and 150 characters.");
      return;
    }

    saveLock.current = true;
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const saved = await updateProject(project.id, {
        name: cleanName,
        description: description.trim() || null,
      });
      onSaved(saved);
      setName(saved.name);
      setDescription(saved.description ?? "");
      setEditing(false);
      setNotice("Project details saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save project details.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  const inputClass =
    "mt-2 w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none focus:border-violet-400 disabled:opacity-60";

  return (
    <section
      className={styles.panel}
      aria-labelledby="project-editor-title"
      style={{ marginBottom: "24px" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className={styles.eyebrow}>PROJECT DETAILS</p>
          <h2 id="project-editor-title">Make it yours</h2>
        </div>
        {!editing && (
          <button type="button" className={styles.secondary} onClick={startEditing}>
            Edit project details
          </button>
        )}
      </div>

      {notice && <p role="status" className="mt-4 text-sm text-emerald-300">{notice}</p>}

      {editing && (
        <form onSubmit={save} className="mt-6 space-y-5" aria-busy={saving}>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <div>
            <label htmlFor="project-name" className="text-sm text-zinc-300">
              Project name
            </label>
            <input
              id="project-name"
              name="project_name"
              autoFocus
              required
              maxLength={150}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={saving}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="project-description" className="text-sm text-zinc-300">
              Description
            </label>
            <textarea
              id="project-description"
              name="project_description"
              maxLength={5000}
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={saving}
              className={inputClass}
            />
            <p className="mt-2 text-xs text-zinc-500">{description.length}/5000 characters</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving || !dirty || !name.trim()}
              className={`${styles.primary} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {saving ? "Saving..." : "Save project details"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className={`${styles.secondary} disabled:opacity-50`}
            >
              Cancel
            </button>
            <p className="text-sm text-zinc-400">
              {saving ? "Saving your changes..." : dirty ? "Unsaved project edits" : "No changes yet"}
            </p>
          </div>
        </form>
      )}
      <CreativeBriefEditor key={project.id} projectId={project.id} />
    </section>
  );
}
