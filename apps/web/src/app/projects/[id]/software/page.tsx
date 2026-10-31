"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getProject } from "@/lib/projects";
import {
  getSoftware, saveSoftware,
  type SoftwareData, type SoftwarePage, type SoftwareSection,
  type SoftwareFeature,
} from "@/lib/software";
import styles from "./software.module.css";

const empty: SoftwareData = {
  title: "", description: "", platform: "web", pages: [], features: [],
};

function dataFrom(saved: SoftwareData): SoftwareData {
  return {
    title: saved.title, description: saved.description, platform: saved.platform,
    pages: saved.pages, features: saved.features,
  };
}

function move<T>(items: T[], index: number, direction: number): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const result = [...items];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}

export default function SoftwareStudioPage() {
  const params = useParams();
  const projectId = Number(params.id);
  return <SoftwareEditor key={String(params.id)} projectId={projectId} />;
}

function SoftwareEditor({ projectId }: { projectId: number }) {
  const [data, setData] = useState<SoftwareData>(empty);
  const [baseline, setBaseline] = useState(JSON.stringify(empty));
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  const dirty = ready && JSON.stringify(data) !== baseline;

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setReady(false);
      setError("");
      try {
        if (!Number.isSafeInteger(projectId) || projectId < 1) {
          throw new Error("Invalid project ID.");
        }
        const project = await getProject(projectId);
        if (!["website", "app"].includes(project.project_type)) {
          throw new Error("Open this studio from a website or app project.");
        }
        let next: SoftwareData;
        let nextVersion = 0;
        try {
          const saved = await getSoftware(projectId);
          next = dataFrom(saved);
          nextVersion = saved.version;
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 404 ||
              err.message !== "No software blueprint saved yet.") throw err;
          next = {
            ...empty,
            title: project.name,
            platform: project.project_type === "app" ? "web_and_mobile" : "web",
            pages: [{
              id: crypto.randomUUID(), name: "Home", path: "/",
              sections: [{
                id: crypto.randomUUID(), kind: "hero",
                heading: project.name, content: project.description || "",
              }],
            }],
            features: [],
          };
        }
        if (!active) return;
        setData(next);
        setBaseline(JSON.stringify(next));
        setVersion(nextVersion);
        setReady(true);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load blueprint.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [projectId, retry]);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirty && !saving) return;
      event.preventDefault();
      event.returnValue = "";
    }
    function guardNavigation(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 ||
          !(event.target instanceof Element)) return;
      const link = event.target.closest("a");
      if (!link || link.hasAttribute("download")) return;
      const target = new URL(link.href, window.location.href);
      if (target.origin === window.location.origin &&
          target.pathname === window.location.pathname &&
          target.search === window.location.search) return;
      if (saving || lock.current) {
        event.preventDefault();
        event.stopPropagation();
        setNotice("Wait for saving to finish before leaving.");
      } else if (dirty && !window.confirm("Leave without saving your blueprint changes?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", guardNavigation, true);
    };
  }, [dirty, saving]);

  function change(values: Partial<SoftwareData>) {
    setData((current) => ({ ...current, ...values }));
    setNotice("");
  }

  function updatePage(id: string, values: Partial<SoftwarePage>) {
    setData((current) => ({
      ...current,
      pages: current.pages.map((page) => page.id === id ? { ...page, ...values } : page),
    }));
    setNotice("");
  }

  function updateSection(pageId: string, id: string, values: Partial<SoftwareSection>) {
    setData((current) => ({
      ...current,
      pages: current.pages.map((page) => page.id === pageId ? {
        ...page,
        sections: page.sections.map((section) =>
          section.id === id ? { ...section, ...values } : section),
      } : page),
    }));
    setNotice("");
  }

  function updateFeature(id: string, values: Partial<SoftwareFeature>) {
    setData((current) => ({
      ...current,
      features: current.features.map((feature) =>
        feature.id === id ? { ...feature, ...values } : feature),
    }));
    setNotice("");
  }

  function exportDraft() {
    const blob = new Blob([JSON.stringify({
      project_id: projectId, expected_version: version, ...data,
    }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `indaverse-software-${projectId}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Blueprint draft exported.");
  }

  async function save() {
    if (lock.current || !ready) return;
    if (!data.title.trim()) {
      setError("Give your blueprint a title.");
      return;
    }
    if (data.pages.some((page) => !page.name.trim()) ||
        data.features.some((feature) => !feature.title.trim())) {
      setError("Every page and feature needs a name.");
      return;
    }
    if (data.pages.some((page) => !/^\/[a-zA-Z0-9/_-]*$/.test(page.path))) {
      setError("Page paths must start with / and use letters, numbers, /, _ or -.");
      return;
    }
    if (new Set(data.pages.map((page) => page.path)).size !== data.pages.length) {
      setError("Use a different path for each page.");
      return;
    }
    lock.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveSoftware(projectId, data, version);
      const next = dataFrom(saved);
      setData(next);
      setBaseline(JSON.stringify(next));
      setVersion(saved.version);
      setNotice(`Blueprint saved. Version ${saved.version}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save blueprint.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  function reload() {
    if (lock.current) return;
    if (dirty && !window.confirm("Replace your unsaved draft? Export it first if you want to keep it.")) return;
    setNotice("");
    setRetry((value) => value + 1);
  }

  if (loading) return <main className={styles.page} aria-busy="true">Opening Web &amp; App Studio...</main>;

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <nav className={styles.navigation} aria-label="Studio navigation">
          <Link href="/dashboard">IndaVerse</Link>
          <Link href={`/projects/${projectId}`}>Back to project</Link>
        </nav>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>WEB &amp; APP STUDIO</p>
          <h1>Give your idea a structure.</h1>
          <p>Plan your pages, content, and features in one saved blueprint.</p>
        </header>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        {!ready ? (
          <button className={styles.secondary} onClick={reload}>Retry loading</button>
        ) : (
          <>
            <div className={styles.toolbar}>
              <span>{version ? `Saved version ${version}` : "New blueprint"} ? {dirty ? "Unsaved changes" : "Draft up to date"}</span>
              <Link className={styles.secondary}
                href={`/projects/${projectId}/software/preview`}>Preview saved blueprint</Link>
              <button className={styles.secondary} disabled={saving} onClick={exportDraft}>Export draft</button>
              <button className={styles.secondary} disabled={saving} onClick={reload}>Load latest</button>
              <button className={styles.primary} disabled={saving || (!dirty && version > 0)} onClick={() => void save()}>
                {saving ? "Saving..." : "Save blueprint"}
              </button>
            </div>
            <fieldset className={styles.editor} disabled={saving}>
              <section className={styles.panel}>
                <h2>The essentials</h2>
                <label>Blueprint title
                  <input maxLength={150} value={data.title}
                    onChange={(event) => change({ title: event.target.value })} />
                </label>
                <label>Purpose and direction
                  <textarea rows={3} maxLength={10000} value={data.description}
                    onChange={(event) => change({ description: event.target.value })} />
                </label>
                <label>Target platform
                  <select value={data.platform} onChange={(event) =>
                    change({ platform: event.target.value as SoftwareData["platform"] })}>
                    <option value="web">Web</option>
                    <option value="mobile">Mobile</option>
                    <option value="web_and_mobile">Web and mobile</option>
                  </select>
                </label>
              </section>

              <section className={styles.panel}>
                <div className={styles.heading}>
                  <div><h2>Pages and screens</h2><p>{data.pages.length} of 50 pages</p></div>
                  <button className={styles.secondary} disabled={data.pages.length >= 50} onClick={() => {
                    let number = data.pages.length + 1;
                    while (data.pages.some((page) => page.path === `/page-${number}`)) number++;
                    change({ pages: [...data.pages, {
                      id: crypto.randomUUID(), name: `Page ${number}`,
                      path: `/page-${number}`, sections: [],
                    }] });
                  }}>+ Add page</button>
                </div>
                {data.pages.length === 0 && <p>No pages yet. Add your first page or screen.</p>}
                {data.pages.map((page, index) => (
                  <article className={styles.card} key={page.id}>
                    <div className={styles.heading}>
                      <h3>Page {index + 1}</h3>
                      <div className={styles.actions}>
                        <button aria-label={`Move ${page.name} up`} disabled={index === 0}
                          onClick={() => change({ pages: move(data.pages, index, -1) })}>Move up</button>
                        <button aria-label={`Move ${page.name} down`} disabled={index === data.pages.length - 1}
                          onClick={() => change({ pages: move(data.pages, index, 1) })}>Move down</button>
                        <button onClick={() => {
                          if (window.confirm(`Remove "${page.name}" and its sections from this draft?`)) {
                            change({ pages: data.pages.filter((item) => item.id !== page.id) });
                          }
                        }}>Remove page</button>
                      </div>
                    </div>
                    <div className={styles.grid}>
                      <label>Page name<input maxLength={150} value={page.name}
                        onChange={(event) => updatePage(page.id, { name: event.target.value })} /></label>
                      <label>Page path<input maxLength={200} value={page.path}
                        onChange={(event) => updatePage(page.id, { path: event.target.value })} /></label>
                    </div>
                    {page.sections.map((section, sectionIndex) => (
                      <div className={styles.section} key={section.id}>
                        <div className={styles.heading}>
                          <h4>Section {sectionIndex + 1}</h4>
                          <div className={styles.actions}>
                            <button disabled={sectionIndex === 0}
                              onClick={() => updatePage(page.id, { sections: move(page.sections, sectionIndex, -1) })}>Move up</button>
                            <button disabled={sectionIndex === page.sections.length - 1}
                              onClick={() => updatePage(page.id, { sections: move(page.sections, sectionIndex, 1) })}>Move down</button>
                            <button onClick={() => {
                              if (window.confirm("Remove this section from your draft?")) {
                                updatePage(page.id, { sections: page.sections.filter((item) => item.id !== section.id) });
                              }
                            }}>Remove section</button>
                          </div>
                        </div>
                        <label>Section type<select value={section.kind} onChange={(event) =>
                          updateSection(page.id, section.id, { kind: event.target.value as SoftwareSection["kind"] })}>
                          <option value="hero">Hero</option><option value="text">Text</option>
                          <option value="cards">Cards</option><option value="form">Form</option>
                          <option value="call_to_action">Call to action</option>
                        </select></label>
                        <label>Heading<input maxLength={200} value={section.heading}
                          onChange={(event) => updateSection(page.id, section.id, { heading: event.target.value })} /></label>
                        <label>Content or requirements<textarea rows={4} maxLength={10000} value={section.content}
                          onChange={(event) => updateSection(page.id, section.id, { content: event.target.value })} /></label>
                      </div>
                    ))}
                    <button className={styles.secondary} disabled={page.sections.length >= 30}
                      onClick={() => updatePage(page.id, { sections: [...page.sections, {
                        id: crypto.randomUUID(), kind: "text", heading: "", content: "",
                      }] })}>+ Add section</button>
                  </article>
                ))}
              </section>

              <section className={styles.panel}>
                <div className={styles.heading}>
                  <div><h2>Feature requirements</h2><p>{data.features.length} of 100 features</p></div>
                  <button className={styles.secondary} disabled={data.features.length >= 100}
                    onClick={() => change({ features: [...data.features, {
                      id: crypto.randomUUID(), title: "New feature",
                      description: "", priority: "must_have",
                    }] })}>+ Add feature</button>
                </div>
                {data.features.length === 0 && <p>Add the capabilities your product needs.</p>}
                {data.features.map((feature) => (
                  <article className={styles.card} key={feature.id}>
                    <label>Feature name<input maxLength={200} value={feature.title}
                      onChange={(event) => updateFeature(feature.id, { title: event.target.value })} /></label>
                    <label>What should it do?<textarea rows={3} maxLength={5000} value={feature.description}
                      onChange={(event) => updateFeature(feature.id, { description: event.target.value })} /></label>
                    <label>Priority<select value={feature.priority} onChange={(event) =>
                      updateFeature(feature.id, { priority: event.target.value as SoftwareFeature["priority"] })}>
                      <option value="must_have">Must have</option>
                      <option value="should_have">Should have</option>
                      <option value="later">Later</option>
                    </select></label>
                    <button className={styles.secondary} onClick={() => {
                      if (window.confirm(`Remove "${feature.title}" from your draft?`)) {
                        change({ features: data.features.filter((item) => item.id !== feature.id) });
                      }
                    }}>Remove feature</button>
                  </article>
                ))}
              </section>
            </fieldset>
            <p className={styles.footnote}>This studio saves your blueprint. Software generation and deployment will be added in later upgrades.</p>
          </>
        )}
      </div>
    </main>
  );
}
