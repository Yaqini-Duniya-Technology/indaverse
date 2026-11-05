"use client";

import { useEffect, useState } from "react";
import SnapshotCompare from "@/components/SnapshotCompare";
import ProjectImage from "@/components/ProjectImage";
import {
  listGameRevisions, type GameRevision, type GameRevisionPage,
} from "@/lib/game";
import styles from "./game.module.css";

export default function GameHistory({
  projectId, savedVersion, disabled, onRestore, currentDraft,
}: {
  currentDraft: unknown;
  projectId: number;
  savedVersion: number;
  disabled: boolean;
  onRestore: (revision: GameRevision) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState<GameRevisionPage | null>(null);
  const [selected, setSelected] = useState<GameRevision | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setPage(null);
    setSelected(null);
    void listGameRevisions(projectId, offset).then((result) => {
      if (active) setPage(result);
    }).catch((err) => {
      if (active) setError(err instanceof Error ? err.message : "Unable to load history.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [projectId, savedVersion, offset, retry]);

  const textStyle = {
    whiteSpace: "pre-wrap" as const,
    overflowWrap: "anywhere" as const,
    lineHeight: 1.85,
    marginTop: 12,
  };

  return (
    <section className={styles.panel}>
      <div className={styles.heading}>
        <div>
          <h2>Saved design history</h2>
          <p>Review earlier designs and load one into your draft.</p>
        </div>
        <button className={styles.secondary} disabled={disabled || loading}
          onClick={() => { setOffset(0); setRetry((value) => value + 1); }}>Refresh history</button>
      </div>
      {loading && <p role="status">Loading saved versions...</p>}
      {error && <div>
        <p className={styles.error} role="alert">{error}</p>
        <button className={styles.secondary} disabled={disabled || loading}
          onClick={() => setRetry((value) => value + 1)}>Retry history</button>
      </div>}
      {page && page.items.length === 0 && (
        <p>No versions on this page. Existing designs enter history when you next change and save them.</p>
      )}
      {page?.items.map((revision) => (
        <article className={styles.card} key={revision.id}>
          <div className={styles.heading}>
            <div>
              <h3>Version {revision.version}: {revision.snapshot.title}</h3>
              <p>{revision.reason} / {revision.snapshot.dimension.toUpperCase()} /
                {" "}{revision.snapshot.levels.length} levels</p>
              <p className={styles.footnote}>{new Date(revision.created_at).toLocaleString()}</p>
            </div>
            <button className={styles.secondary} disabled={disabled}
              onClick={() => setSelected(revision)}>Review version</button>
          </div>
        </article>
      ))}
      {page && (
        <div className={styles.actions}>
          <button className={styles.secondary} disabled={disabled || loading || offset === 0}
            onClick={() => setOffset((value) => Math.max(0, value - 10))}>Previous page</button>
          <span>{page.total} saved versions</span>
          <button className={styles.secondary}
            disabled={disabled || loading || offset + page.limit >= page.total}
            onClick={() => setOffset((value) => value + 10)}>Next page</button>
        </div>
      )}

      {selected && (
        <article className={styles.card}>
          <div className={styles.heading}>
            <h3>Reviewing version {selected.version}</h3>
            <button className={styles.secondary} disabled={disabled}
              onClick={() => setSelected(null)}>Close review</button>
          </div>
          <SnapshotCompare saved={selected.snapshot} working={currentDraft} />
          <h3>{selected.snapshot.title}</h3>
          <p>{selected.snapshot.dimension.toUpperCase()} / {selected.snapshot.genre || "Genre not set"}</p>
          <h4 className="mt-5 font-semibold">Concept</h4>
          <p style={textStyle}>{selected.snapshot.concept || "Not set."}</p>
          <h4 className="mt-5 font-semibold">Gameplay loop</h4>
          <p style={textStyle}>{selected.snapshot.core_loop || "Not set."}</p>
          <h4 className="mt-5 font-semibold">Controls</h4>
          <p style={textStyle}>{selected.snapshot.controls || "Not set."}</p>

          <h4 className="mt-6 font-semibold">Characters</h4>
          {!selected.snapshot.characters.length && <p>No characters.</p>}
          {selected.snapshot.characters.map((item) => (
            <div className={styles.card} key={item.id}>
              <h4>{item.name} / {item.role}</h4>
              <p style={textStyle}>{item.description || "No description."}</p>
              {item.image_id && <ProjectImage projectId={projectId} imageId={item.image_id}
                alt={`Saved reference for ${item.name}`} className="mt-3 h-40 w-full rounded-xl object-contain" />}
            </div>
          ))}

          <h4 className="mt-6 font-semibold">Ordered levels</h4>
          {!selected.snapshot.levels.length && <p>No levels.</p>}
          {selected.snapshot.levels.map((item, index) => (
            <div className={styles.card} key={item.id}>
              <h4>{index + 1}. {item.title}</h4>
              <p style={textStyle}>Setting: {item.setting || "Not set."}</p>
              <p style={textStyle}>Objective: {item.objective || "Not set."}</p>
              <p style={textStyle}>Challenges: {item.challenges || "Not set."}</p>
              {item.image_id && <ProjectImage projectId={projectId} imageId={item.image_id}
                alt={`Saved reference for ${item.title}`} className="mt-3 h-40 w-full rounded-xl object-contain" />}
            </div>
          ))}

          <h4 className="mt-6 font-semibold">Asset requirements</h4>
          {!selected.snapshot.assets.length && <p>No asset requirements.</p>}
          {selected.snapshot.assets.map((item) => (
            <div className={styles.card} key={item.id}>
              <h4>{item.title} / {item.kind}</h4>
              <p style={textStyle}>{item.description || "No specifications."}</p>
            </div>
          ))}
          <p className={styles.footnote}>Image references use the current project library. Unavailable images may need to be replaced or unlinked before saving.</p>
          <button className={styles.primary} disabled={disabled}
            onClick={() => onRestore(selected)}>Load version {selected.version} into draft</button>
          <p className={styles.footnote}>Loading changes only your editor draft. Save the blueprint to store it as the next version.</p>
        </article>
      )}
    </section>
  );
}
