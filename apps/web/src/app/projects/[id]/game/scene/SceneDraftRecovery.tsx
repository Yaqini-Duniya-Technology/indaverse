"use client";

import { useEffect, useRef, useState } from "react";
import { getCurrentUser } from "@/lib/auth";
import type { SceneLayout } from "@/lib/gameScene";
import { apiFetch } from "@/lib/api";
import styles from "./scene.module.css";

type SceneValidation = {
  valid: true;
  data: SceneLayout;
  issues: { field: string; message: string }[];
  warnings: string[];
} | {
  valid: false;
  data: null;
  issues: { field: string; message: string }[];
  warnings: string[];
};

async function validateSceneRecovery(
  projectId: number, layout: unknown,
): Promise<SceneValidation> {
  try {
    const data = await apiFetch<SceneLayout>(
      `/api/v1/projects/${projectId}/game/scene/validate`,
      { method: "POST", body: layout },
    );
    return { valid: true, data, issues: [], warnings: [] };
  } catch (err) {
    return {
      valid: false, data: null, warnings: [],
      issues: [{
        field: "Scene",
        message: err instanceof Error ? err.message : "Unable to validate this recovery copy.",
      }],
    };
  }
}

type RecoveryRecord = {
  recovery_version: 1;
  user_id: number;
  project_id: number;
  base_version: number;
  saved_at: string;
  layout: unknown;
};
type Copy = { key: string; record: RecoveryRecord };
type Context = {
  userId: number;
  projectId: number;
  prefix: string;
  key: string;
};

function readCopies(context: Context): Copy[] {
  const copies: Copy[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key || key === context.key || !key.startsWith(context.prefix)) continue;
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(key) || "null");
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
      const value = raw as Record<string, unknown>;
      if (
        value.recovery_version !== 1 ||
        value.user_id !== context.userId ||
        value.project_id !== context.projectId ||
        !Number.isSafeInteger(value.base_version) ||
        typeof value.base_version !== "number" || value.base_version < 0 ||
        typeof value.saved_at !== "string" ||
        !Number.isFinite(Date.parse(value.saved_at)) ||
        typeof value.layout !== "object" || value.layout === null
      ) continue;
      copies.push({ key, record: value as RecoveryRecord });
    } catch {
      // Ignore malformed records without deleting anything.
    }
  }
  return copies.sort((a, b) =>
    Date.parse(b.record.saved_at) - Date.parse(a.record.saved_at));
}

export default function SceneDraftRecovery({
  projectId, data, version, dirty, disabled, onApply,
}: {
  projectId: number;
  data: SceneLayout;
  version: number;
  dirty: boolean;
  disabled: boolean;
  onApply: (data: SceneLayout) => boolean;
}) {
  const [context, setContext] = useState<Context | null>(null);
  const [copies, setCopies] = useState<Copy[]>([]);
  const [status, setStatus] = useState("Preparing browser draft recovery...");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<Copy | null>(null);
  const [report, setReport] = useState<SceneValidation | null>(null);
  const latest = useRef({ data, version, dirty });
  const mounted = useRef(false);
  const checking = useRef(false);

  // This ref also supplies the newest draft to page-exit handlers.
  useEffect(() => {
    latest.current = { data, version, dirty };
  }, [data, version, dirty]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    void (async () => {
      try {
        const user = await getCurrentUser();
        if (!active) return;
        const prefix = `indaverse:scene-recovery:v1:${user.id}:${projectId}:`;
        const next = {
          userId: user.id, projectId, prefix,
          // Every editor mount gets its own key, including duplicated tabs.
          key: prefix + crypto.randomUUID(),
        };
        const probe = next.key + ":probe";
        localStorage.setItem(probe, "1");
        localStorage.removeItem(probe);
        setCopies(readCopies(next));
        setContext(next);
        setStatus("Browser recovery ready.");
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Browser recovery is unavailable.");
          setStatus("Recovery unavailable. Export your draft to keep a copy.");
        }
      }
    })();
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [projectId]);

  // Save after 800 ms without another edit. Clean drafts remove only this
  // editor's copy; recovery records belonging to other tabs remain untouched.
  useEffect(() => {
    if (!context) return;
    const timer = window.setTimeout(() => {
      try {
        const snapshot = latest.current;
        if (!snapshot.dirty) {
          localStorage.removeItem(context.key);
          setStatus("Draft matches the saved layout.");
          return;
        }
        const record: RecoveryRecord = {
          recovery_version: 1,
          user_id: context.userId,
          project_id: context.projectId,
          base_version: snapshot.version,
          saved_at: new Date().toISOString(),
          layout: snapshot.data,
        };
        localStorage.setItem(context.key, JSON.stringify(record));
        setStatus(`Recovery copy saved in this browser at ${new Date(record.saved_at).toLocaleTimeString()}.`);
        setError("");
      } catch {
        setStatus("Browser recovery could not save.");
        setError("Browser storage may be full or blocked. Export your draft before leaving.");
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [context, data, version, dirty]);

  useEffect(() => {
    if (!context) return;

    function flush() {
      try {
        const snapshot = latest.current;
        if (!snapshot.dirty) {
          localStorage.removeItem(context!.key);
          return;
        }
        localStorage.setItem(context!.key, JSON.stringify({
          recovery_version: 1,
          user_id: context!.userId,
          project_id: context!.projectId,
          base_version: snapshot.version,
          saved_at: new Date().toISOString(),
          layout: snapshot.data,
        }));
      } catch {
        // The editor retains its leave warning and manual export.
      }
    }

    function hidden() {
      if (document.hidden) flush();
    }

    function storage(event: StorageEvent) {
      if (event.key === null || event.key.startsWith(context!.prefix)) {
        try {
          setCopies(readCopies(context!));
        } catch {
          setError("Unable to refresh browser recovery copies.");
        }
      }
    }

    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("storage", storage);

    return () => {
      flush();
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("storage", storage);
    };
  }, [context]);

  function refresh() {
    if (!context) return;
    try {
      setCopies(readCopies(context));
    } catch {
      setError("Unable to read browser recovery copies.");
    }
  }

  async function review(copy: Copy) {
    if (disabled || checking.current) return;
    checking.current = true;
    setPending(true);
    setError("");
    setReport(null);
    setSelected(copy);
    try {
      const result = await validateSceneRecovery(
        projectId, copy.record.layout,
      );
      if (mounted.current) setReport(result);
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : "Unable to validate the recovery copy.");
      }
    } finally {
      checking.current = false;
      if (mounted.current) setPending(false);
    }
  }

  function download(copy: Copy) {
    const url = URL.createObjectURL(new Blob([
      JSON.stringify(copy.record.layout, null, 2),
    ], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `indaverse-scene-${projectId}-recovery.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function discard(copy: Copy) {
    if (disabled || pending || !context) return;
    if (!window.confirm("Delete this browser recovery copy? This does not change your current draft or saved layout.")) return;
    try {
      localStorage.removeItem(copy.key);
      setCopies(readCopies(context));
      if (selected?.key === copy.key) {
        setSelected(null);
        setReport(null);
      }
    } catch {
      setError("Unable to delete this recovery copy.");
    }
  }

  return <section className={styles.panel} aria-label="Browser scene recovery">
    <h2>Scene draft recovery</h2>
    <p role="status">{status}</p>
    <p>Recovery copies stay in this browser and are separate from server saves.
      Each account, project, and editor tab uses a separate copy.
      Clearing browser storage removes these copies. They are not encrypted backups. Export important drafts.</p>

    {error && <p className={styles.alert} role="alert">{error}</p>}

    <button type="button" className={styles.card}
      disabled={!context || disabled || pending} onClick={refresh}>
      Refresh recovery copies
    </button>

    {copies.length === 0 ? <p>No other recovery copies found for this account and project.</p> :
      <p>{copies.length} recovery copies available. Showing the newest 10.</p>}

    {copies.slice(0, 10).map((copy) => (
      <article className={styles.card} key={copy.key}>
        <h3>Recovery from {new Date(copy.record.saved_at).toLocaleString()}</h3>
        <p>Based on saved version {copy.record.base_version}.
          {" "}Current saved version: {version}.</p>
        {copy.record.base_version !== version && <p>
          The saved layout version differs. Compare carefully before restoring.
          Restoring keeps this editor's current save version.
        </p>}
        <div className={styles.toolbar}>
          <button type="button" disabled={disabled || pending}
            onClick={() => void review(copy)}>Review and validate</button>
          <button type="button" disabled={disabled || pending}
            onClick={() => download(copy)}>Export recovery</button>
          <button type="button" disabled={disabled || pending}
            onClick={() => discard(copy)}>Delete recovery copy</button>
        </div>
      </article>
    ))}

    {pending && <p role="status">Validating recovery copy...</p>}

    {selected && report && <article className={styles.card}>
      <h3>Recovery preview</h3>
      {report.issues.length > 0 && <div role="alert">
        <p>This copy contains incomplete or invalid fields. Export it to preserve the contents. Correct the scene using the editor before saving.</p>
        <ul style={{ listStyle: "disc", paddingLeft: 24 }}>
          {report.issues.map((issue, index) => <li key={`${issue.field}:${index}`}>
            <strong>{issue.field}</strong>: {issue.message}
          </li>)}
        </ul>
      </div>}
      {report.warnings.length > 0 && <ul style={{ listStyle: "disc", paddingLeft: 24 }}>
        {report.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
      </ul>}
      {report.valid && <>
        <p><strong>Validated 3D scene recovery</strong></p>
        <p>{report.data.platforms.length} platforms and
          {" "}{report.data.collectibles.length} collectibles.</p>
        <details>
          <summary>Review complete recovery layout</summary>
          <pre style={{
            whiteSpace: "pre-wrap", overflowWrap: "anywhere",
            maxHeight: 400, overflowY: "auto",
          }}>{JSON.stringify(report.data, null, 2)}</pre>
        </details>
        <p>Restoring replaces the current draft. It does not save to the server
          or delete the original recovery copy.</p>
        <button type="button" className={styles.card}
          disabled={disabled || pending} onClick={() => {
            if (onApply(report.data)) {
              setSelected(null);
              setReport(null);
            }
          }}>Restore to draft</button>
      </>}
    </article>}
  </section>;
}
