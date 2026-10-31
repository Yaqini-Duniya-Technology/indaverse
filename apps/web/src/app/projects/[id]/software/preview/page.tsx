"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getProject } from "@/lib/projects";
import { getSoftware, type SoftwareProject } from "@/lib/software";
import styles from "./preview.module.css";

export default function SoftwarePreviewPage() {
  const params = useParams();
  const projectId = Number(params.id);
  return <Preview key={String(params.id)} projectId={projectId} />;
}

function Preview({ projectId }: { projectId: number }) {
  const [blueprint, setBlueprint] = useState<SoftwareProject | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [empty, setEmpty] = useState(false);
  const [retry, setRetry] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusPage = useRef(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      setEmpty(false);
      setBlueprint(null);
      try {
        if (!Number.isSafeInteger(projectId) || projectId < 1) {
          throw new Error("Invalid project ID.");
        }
        const project = await getProject(projectId);
        if (!["website", "app"].includes(project.project_type)) {
          throw new Error("Open this preview from a website or app project.");
        }
        const saved = await getSoftware(projectId);
        if (!active) return;
        setBlueprint(saved);
        setSelectedId((current) =>
          saved.pages.some((page) => page.id === current)
            ? current : saved.pages[0]?.id || "");
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404 &&
            err.message === "No software blueprint saved yet.") {
          setEmpty(true);
        } else {
          setError(err instanceof Error ? err.message : "Unable to load preview.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [projectId, retry]);

  useEffect(() => {
    if (focusPage.current && blueprint) {
      heading.current?.focus();
      focusPage.current = false;
    }
  }, [selectedId, blueprint]);

  const page = blueprint?.pages.find((item) => item.id === selectedId);

  function selectPage(id: string) {
    if (id === selectedId) {
      heading.current?.focus();
      return;
    }
    focusPage.current = true;
    setSelectedId(id);
  }

  return (
    <main className={styles.page}>
      <a className={styles.skip} href="#preview-content">Skip to preview</a>
      <div className={styles.container}>
        <nav className={styles.navigation} aria-label="Preview navigation">
          <Link href={`/projects/${projectId}`}>Back to project</Link>
          <Link href={`/projects/${projectId}/software`}>Edit in Web &amp; App Studio</Link>
        </nav>
        <header className={styles.header}>
          <p className={styles.eyebrow}>PRIVATE BLUEPRINT PREVIEW</p>
          <h1>{blueprint?.title || "Your software preview"}</h1>
          <p>Review saved content and layout. Forms and action buttons are visual placeholders.</p>
        </header>

        {loading ? (
          <p aria-busy="true" className={styles.message}>Loading saved blueprint...</p>
        ) : error ? (
          <section className={styles.message}>
            <p role="alert">{error}</p>
            <button onClick={() => setRetry((value) => value + 1)}>Retry</button>
          </section>
        ) : empty ? (
          <section className={styles.message}>
            <h2>No saved blueprint yet</h2>
            <p>Save your pages in Web &amp; App Studio, then return to preview them.</p>
            <Link href={`/projects/${projectId}/software`}>Open the studio</Link>
          </section>
        ) : blueprint ? (
          <>
            <div className={styles.controls}>
              <span>Version {blueprint.version} ? {blueprint.platform.replaceAll("_", " ")}</span>
              <div className={styles.deviceControls} role="group" aria-label="Preview width">
                <button aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>Desktop</button>
                <button aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}>Mobile</button>
              </div>
              <button onClick={() => setRetry((value) => value + 1)}>Refresh saved preview</button>
            </div>
            <p className={styles.muted}>Updated {new Date(blueprint.updated_at).toLocaleString()}. Unsaved editor changes are excluded.</p>

            <div className={styles.layout}>
              <aside className={styles.sidebar}>
                <h2>Pages and screens</h2>
                <nav aria-label="Blueprint pages">
                  {blueprint.pages.map((item) => (
                    <button key={item.id} aria-current={item.id === selectedId ? "page" : undefined}
                      onClick={() => selectPage(item.id)}>
                      <strong>{item.name}</strong><small>{item.path}</small>
                    </button>
                  ))}
                </nav>
                {blueprint.pages.length === 0 && <p>No pages saved.</p>}
              </aside>
              <div className={styles.stage} id="preview-content">
                <div className={styles.frame} data-device={device}>
                  <div className={styles.address}>{page?.path || "/"} ? {device === "mobile" ? "Mobile layout" : "Desktop layout"}</div>
                  <div className={styles.canvas}>
                    <div className={styles.brand}>{blueprint.title}</div>
                    <h2 ref={heading} tabIndex={-1} className={styles.pageTitle}>
                      {page?.name || "Add your first page"}
                    </h2>
                    {!page && <p className={styles.placeholder}>Add and save a page in the studio to preview it here.</p>}
                    {page && page.sections.length === 0 && (
                      <p className={styles.placeholder}>This page has no sections yet.</p>
                    )}
                    {page?.sections.map((section) => (
                      <section key={section.id} className={styles.block} data-kind={section.kind}>
                        <p className={styles.sectionType}>{section.kind.replaceAll("_", " ")}</p>
                        {section.heading && <h3>{section.heading}</h3>}
                        {section.kind === "cards" ? (
                          <div className={styles.cards}>
                            {section.content.split(/\n\s*\n/).filter((item) => item.trim()).map((item, index) => (
                              <p key={index}>{item}</p>
                            ))}
                            {!section.content.trim() && <p>Card content will appear here. Separate cards with a blank line in the editor.</p>}
                          </div>
                        ) : (
                          <p className={styles.content}>{section.content || "Add content in the studio."}</p>
                        )}
                        {section.kind === "form" && (
                          <div className={styles.formPreview} aria-label="Form layout placeholder">
                            <label>Example field<input disabled placeholder="Preview only" /></label>
                            <button disabled>Submit ? preview only</button>
                            <small>No information is collected.</small>
                          </div>
                        )}
                        {section.kind === "call_to_action" && (
                          <button className={styles.actionPreview} disabled>Action ? preview only</button>
                        )}
                      </section>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <section className={styles.requirements}>
              <h2>Feature requirements</h2>
              <p className={styles.muted}>These describe planned capabilities. They are not implemented by this preview.</p>
              {blueprint.features.length === 0 && <p>No features saved.</p>}
              <div className={styles.featureGrid}>
                {blueprint.features.map((feature) => (
                  <article key={feature.id}>
                    <span>{feature.priority.replaceAll("_", " ")}</span>
                    <h3>{feature.title}</h3>
                    <p>{feature.description || "No description added."}</p>
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
