"use client";

import { useEffect, useRef, useState } from "react";
import type { GameData } from "@/lib/game";
import {
  validateBlueprint, type BlueprintValidation,
} from "@/lib/gameBlueprint";
import {
  GAME_TEMPLATES, createGameTemplate, type GameTemplateId,
} from "@/lib/gameTemplates";
import styles from "./game.module.css";

export default function GameTemplates({
  projectId, currentTitle, disabled, onApply,
}: {
  projectId: number;
  currentTitle: string;
  disabled: boolean;
  onApply: (data: GameData) => boolean;
}) {
  const [choice, setChoice] = useState<GameTemplateId>("exploration-2d");
  const [keepTitle, setKeepTitle] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [report, setReport] = useState<BlueprintValidation | null>(null);
  const mounted = useRef(false);
  const busy = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function clearPreview() {
    setReport(null);
    setError("");
    setMessage("");
  }

  async function preview() {
    if (disabled || busy.current) return;
    busy.current = true;
    setPending(true);
    clearPreview();
    try {
      const draft = createGameTemplate(choice);
      if (keepTitle && currentTitle.trim()) draft.title = currentTitle.trim();
      const result = await validateBlueprint(projectId, draft);
      if (mounted.current) {
        setReport(result);
        setMessage(result.valid
          ? "Template validated. Review the complete draft before applying."
          : "Template validation found problems. Your current draft is unchanged.");
      }
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : "Unable to prepare the template.");
      }
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return <section className={styles.panel} aria-label="Game blueprint templates"
    aria-busy={pending}>
    <h2>Start from a template</h2>
    <p>These are reusable design starters, not AI-generated games.
      Applying replaces the complete blueprint draft and turns server autosave off.
      Existing playable layouts, images, and saved history remain separate.</p>

    <label>Template
      <select value={choice} disabled={disabled || pending}
        onChange={(event) => {
          setChoice(event.target.value as GameTemplateId);
          clearPreview();
        }}>
        {GAME_TEMPLATES.map((template) => (
          <option key={template.id} value={template.id}>{template.name}</option>
        ))}
      </select>
    </label>
    <p>{GAME_TEMPLATES.find((template) => template.id === choice)?.description}</p>

    <label>
      <input type="checkbox" checked={keepTitle}
        style={{ display: "inline-block", width: "auto", marginRight: 10 }}
        disabled={disabled || pending} onChange={(event) => {
          setKeepTitle(event.target.checked);
          clearPreview();
        }} />
      Keep my current game title
    </label>

    <button type="button" className={styles.secondary}
      disabled={disabled || pending} onClick={() => void preview()}>
      {pending ? "Preparing preview..." : "Preview template"}
    </button>

    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.notice} role="status">{message}</p>}

    {report && <article className={styles.card}>
      {report.issues.length > 0 && <ul role="alert"
        style={{ listStyle: "disc", paddingLeft: 24 }}>
        {report.issues.map((issue, index) => (
          <li key={`${issue.field}:${index}`}>
            <strong>{issue.field}</strong>: {issue.message}
          </li>
        ))}
      </ul>}

      {report.warnings.length > 0 && <ul
        style={{ listStyle: "disc", paddingLeft: 24 }}>
        {report.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
      </ul>}

      {report.valid && <>
        <h3>{report.data.title}</h3>
        <p>{report.data.dimension.toUpperCase()} / {report.data.genre}</p>
        <p>{report.data.characters.length} characters, {report.data.levels.length} levels,
          {" "}{report.data.assets.length} asset requirements.</p>
        <details>
          <summary>Review complete template blueprint</summary>
          <pre style={{
            whiteSpace: "pre-wrap", overflowWrap: "anywhere",
            maxHeight: 420, overflowY: "auto", margin: "16px 0",
          }}>{JSON.stringify(report.data, null, 2)}</pre>
        </details>
        <p>New entity IDs were created for this preview and will stay stable when
          applied and saved. Applying replaces any changes made since this preview.</p>
        <button type="button" className={styles.primary}
          disabled={disabled || pending} onClick={() => {
            if (onApply(report.data)) {
              setReport(null);
              setMessage("Template applied to draft. Review it, then save manually.");
            }
          }}>Apply template to draft</button>
      </>}
    </article>}
  </section>;
}
