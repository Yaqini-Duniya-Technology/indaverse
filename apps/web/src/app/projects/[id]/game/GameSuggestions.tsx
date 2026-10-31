"use client";

import { useEffect, useRef, useState } from "react";
import type { GameData } from "@/lib/game";
import {
  suggestGameCompletion, type GameSuggestion,
} from "@/lib/gameSuggestions";
import {
  validateBlueprint, type BlueprintValidation,
} from "@/lib/gameBlueprint";
import styles from "./game.module.css";

type Preview = {
  source: string;
  selection: string;
  report: BlueprintValidation;
};

export default function GameSuggestions({
  projectId, data, disabled, onApply,
}: {
  projectId: number;
  data: GameData;
  disabled: boolean;
  onApply: (candidate: GameData, source: string) => boolean;
}) {
  const [suggestions, setSuggestions] = useState<GameSuggestion[] | null>(null);
  const [source, setSource] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const busy = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const stale = suggestions !== null && source !== JSON.stringify(data);
  const selection = JSON.stringify([...selected].sort());
  const applicable = preview !== null && !stale &&
    preview.source === source && preview.selection === selection;

  function review() {
    if (disabled || busy.current) return;
    setSuggestions(suggestGameCompletion(data));
    setSource(JSON.stringify(data));
    setSelected([]);
    setPreview(null);
    setError("");
  }

  async function validate() {
    if (disabled || busy.current || stale || !suggestions || selected.length === 0) return;
    busy.current = true;
    setPending(true);
    setError("");
    setPreview(null);
    const checkedSource = source;
    const checkedSelection = selection;
    try {
      let candidate = JSON.parse(checkedSource) as GameData;
      for (const suggestion of suggestions) {
        if (selected.includes(suggestion.id)) {
          candidate = { ...candidate, ...structuredClone(suggestion.patch) };
        }
      }
      const report = await validateBlueprint(projectId, candidate);
      if (mounted.current) {
        setPreview({
          source: checkedSource, selection: checkedSelection, report,
        });
      }
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : "Unable to validate suggestions.");
      }
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return <section className={styles.panel} aria-label="Guided blueprint completion"
    aria-busy={pending}>
    <h2>Complete missing sections</h2>
    <p>These are rule-based starter suggestions, not AI-generated content.
      Suggestions cover blank direction fields and empty character, level,
      or asset lists. Existing content and IDs are preserved.</p>
    <button type="button" className={styles.secondary}
      disabled={disabled || pending} onClick={review}>
      Review missing sections
    </button>

    {error && <p className={styles.error} role="alert">{error}</p>}
    {stale && <p className={styles.notice} role="status">
      Your draft changed. Select Review missing sections again before applying.
    </p>}

    {suggestions !== null && suggestions.length === 0 && <p role="status">
      No blank sections were found in this check. This does not assess design
      quality or whether the blueprint can be turned into a complete game.
    </p>}

    {suggestions?.map((suggestion) => (
      <article className={styles.card} key={suggestion.id}>
        <label>
          <input type="checkbox"
            style={{ display: "inline-block", width: "auto", marginRight: 10 }}
            disabled={disabled || pending || stale}
            checked={selected.includes(suggestion.id)}
            onChange={(event) => {
              const checked = event.target.checked;
              setSelected((current) => checked
                ? [...current, suggestion.id]
                : current.filter((id) => id !== suggestion.id));
              setPreview(null);
            }} />
          {suggestion.label}
        </label>
        <p>{suggestion.reason}</p>
        <details>
          <summary>Review proposed content</summary>
          <pre style={{
            whiteSpace: "pre-wrap", overflowWrap: "anywhere",
            maxHeight: 300, overflowY: "auto",
          }}>{JSON.stringify(suggestion.patch, null, 2)}</pre>
        </details>
      </article>
    ))}

    {suggestions && suggestions.length > 0 && <button type="button"
      className={styles.secondary}
      disabled={disabled || pending || stale || selected.length === 0}
      onClick={() => void validate()}>
      {pending ? "Validating..." : "Validate selected suggestions"}
    </button>}

    {preview && <article className={styles.card}>
      <h3>Combined draft preview</h3>
      {preview.report.issues.length > 0 && <ul role="alert"
        style={{ listStyle: "disc", paddingLeft: 24 }}>
        {preview.report.issues.map((issue, index) => (
          <li key={`${issue.field}:${index}`}>
            <strong>{issue.field}</strong>: {issue.message}
          </li>
        ))}
      </ul>}

      {preview.report.warnings.length > 0 && <ul
        style={{ listStyle: "disc", paddingLeft: 24 }}>
        {preview.report.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
      </ul>}

      {preview.report.valid && <>
        <details>
          <summary>Review complete validated blueprint</summary>
          <pre style={{
            whiteSpace: "pre-wrap", overflowWrap: "anywhere",
            maxHeight: 420, overflowY: "auto",
          }}>{JSON.stringify(preview.report.data, null, 2)}</pre>
        </details>
        <p>Applying updates the draft and turns server autosave off.
          Review the result before saving.</p>
        <button type="button" className={styles.primary}
          disabled={disabled || pending || !applicable}
          onClick={() => {
            if (preview.report.valid && onApply(preview.report.data, preview.source)) {
              setSuggestions(null);
              setSelected([]);
              setPreview(null);
            }
          }}>Apply selected suggestions</button>
      </>}
    </article>}
  </section>;
}
