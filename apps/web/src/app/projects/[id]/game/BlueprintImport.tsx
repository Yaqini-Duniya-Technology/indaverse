"use client";

import { useEffect, useRef, useState } from "react";
import type { GameData } from "@/lib/game";
import {
  validateBlueprint, type BlueprintValidation,
} from "@/lib/gameBlueprint";
import styles from "./game.module.css";

export default function BlueprintImport({
  projectId, data, disabled, onApply,
}: {
  projectId: number;
  data: GameData;
  disabled: boolean;
  onApply: (data: GameData) => boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [source, setSource] = useState("");
  const [report, setReport] = useState<BlueprintValidation | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function check(document: unknown, label: string) {
    const result = await validateBlueprint(projectId, document);
    if (!mounted.current) return;
    setSource(label);
    setReport(result);
    setMessage(result.valid
      ? "Validation passed. Review the preview before applying it."
      : "Validation found problems. Your current draft is unchanged.");
  }

  async function loadFile(file: File | undefined) {
    if (!file || disabled || busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    setMessage("");
    setReport(null);
    setSource("");

    try {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("Blueprint file is too large. Maximum size is 5 MB.");
      }
      const contents = (await file.text()).replace(/^\uFEFF/, "");
      let document: unknown;
      try {
        document = JSON.parse(contents);
      } catch {
        throw new Error("This file is not valid JSON. Choose an exported blueprint JSON file.");
      }
      if (typeof document !== "object" || document === null || Array.isArray(document)) {
        throw new Error("The blueprint file must contain a JSON object.");
      }
      await check(document, file.name);
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : "Unable to validate this file.");
      }
    } finally {
      busy.current = false;
      if (mounted.current) {
        setPending(false);
        if (input.current) input.current.value = "";
      }
    }
  }

  async function checkCurrent() {
    if (disabled || busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    setMessage("");
    setReport(null);
    setSource("");
    try {
      // Capture a copy so later form edits cannot change this preview.
      await check(structuredClone(data), "Current draft snapshot");
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : "Unable to validate the draft.");
      }
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return <section className={styles.panel} aria-label="Blueprint import and validation"
    aria-busy={pending}>
    <h2>Import and validate a blueprint</h2>
    <p>Choose an existing draft export or a versioned IndaVerse blueprint.
      Validation checks the design without saving it. Applying replaces the
      draft's game direction, characters, levels, and asset requirements.</p>
    <p>Entity IDs are preserved. The destination project and its saved version
      stay unchanged. Image files, playable layouts, and revision history are
      separate resources and are not included in this blueprint export.</p>

    <div className={styles.toolbar}>
      <button type="button" className={styles.secondary}
        disabled={disabled || pending} onClick={() => input.current?.click()}>
        {pending ? "Checking blueprint..." : "Choose blueprint JSON"}
      </button>
      <button type="button" className={styles.secondary}
        disabled={disabled || pending} onClick={() => void checkCurrent()}>
        Check current draft
      </button>
      {report && <button type="button" className={styles.secondary}
        disabled={disabled || pending} onClick={() => {
          setReport(null); setSource(""); setMessage(""); setError("");
        }}>Dismiss preview</button>}
    </div>

    <input ref={input} type="file" accept=".json,application/json" hidden
      disabled={disabled || pending}
      onChange={(event) => void loadFile(event.target.files?.[0])} />

    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.notice} role="status">{message}</p>}

    {report && <div className={styles.card}>
      <h3>Validation preview: {source}</h3>

      {report.issues.length > 0 && <div role="alert">
        <p>Correct these fields in the source file or current draft, then validate again:</p>
        <ul style={{ listStyle: "disc", paddingLeft: 24 }}>
          {report.issues.map((issue, index) => (
            <li key={`${issue.field}:${index}`}>
              <strong>{issue.field}</strong>: {issue.message}
            </li>
          ))}
        </ul>
      </div>}

      {report.warnings.length > 0 && <div>
        <h4>Review these changes before applying</h4>
        <ul style={{ listStyle: "disc", paddingLeft: 24 }}>
          {report.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
        </ul>
      </div>}

      {report.valid && <>
        <p><strong>{report.data.title}</strong> / {report.data.dimension.toUpperCase()}</p>
        <p>{report.data.characters.length} characters, {report.data.levels.length} levels,
          {" "}{report.data.assets.length} asset requirements.</p>
        <details>
          <summary>Review complete validated blueprint</summary>
          <pre style={{
            whiteSpace: "pre-wrap", overflowWrap: "anywhere",
            maxHeight: 420, overflowY: "auto", margin: "16px 0",
          }}>{JSON.stringify(report.data, null, 2)}</pre>
        </details>
        <p>This preview is a snapshot. Applying it replaces any edits made since validation.</p>
        <button type="button" className={styles.primary}
          disabled={disabled || pending} onClick={() => {
            if (onApply(report.data)) {
              setReport(null);
              setSource("");
              setMessage("Blueprint applied to draft. Review it and select Save blueprint when ready.");
            }
          }}>Apply to draft</button>
      </>}
    </div>}
  </section>;
}
