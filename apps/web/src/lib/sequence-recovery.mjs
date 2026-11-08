const FORMAT = "indaverse-sequence-recovery-v1";
const MAX_LENGTH = 64 * 1024;
const numeric = value => value === null || Number.isSafeInteger(value);
const optional = check => value => value === undefined || check(value);
const oneOf = (...values) => value => values.includes(value);
const text = max => value => typeof value === "string" && Array.from(value).length <= max;
const bool = value => typeof value === "boolean";

function matches(value, schema) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).every(key => Object.hasOwn(schema, key)) &&
    Object.entries(schema).every(([key, validate]) => validate(value[key]));
}

const cueSchema = {
  start_ms: numeric, end_ms: numeric, text: text(90), position: optional(oneOf("top", "bottom")),
};
const cutSchema = {
  source_id: value => typeof value === "string" && /^[a-f0-9]{32}$/.test(value),
  start_ms: numeric, end_ms: numeric, title: optional(text(48)), muted: optional(bool),
  volume_percent: optional(Number.isSafeInteger), fade_edges: optional(bool), framing: optional(oneOf("fit", "fill")),
  title_position: optional(oneOf("top", "bottom")), title_duration_ms: optional(Number.isSafeInteger),
  caption: optional(text(90)),
  caption_cues: optional(value => Array.isArray(value) && value.length <= 6 && value.every(cue => matches(cue, cueSchema))),
};
const soundtrackSchema = {
  start_ms: numeric, end_ms: numeric, offset_ms: numeric, volume_percent: Number.isSafeInteger,
  fade_in_ms: numeric, fade_out_ms: numeric, mode: oneOf("mix", "replace"),
};

export function sequenceRecoveryPrefix(userId, projectId) {
  return `indaverse:sequence-recovery:v1:${userId}:${projectId}:`;
}

export function encodeSequenceRecovery(userId, projectId, baseVersion, data, now = new Date().toISOString()) {
  return JSON.stringify({format: FORMAT, user_id: userId, project_id: projectId,
    base_version: baseVersion, saved_at: now, data});
}

function restoreNumbers(record, keys) {
  return {...record, ...Object.fromEntries(keys.filter(key => record[key] === null).map(key => [key, NaN]))};
}

export function parseSequenceRecovery(raw, userId, projectId) {
  try {
    if (typeof raw !== "string" || raw.length > MAX_LENGTH) return null;
    const copy = JSON.parse(raw);
    if (!copy || copy.format !== FORMAT || copy.user_id !== userId || copy.project_id !== projectId ||
        !Number.isSafeInteger(copy.base_version) || copy.base_version < 0 ||
        typeof copy.saved_at !== "string" || !Number.isFinite(Date.parse(copy.saved_at)) ||
        !matches(copy.data, {
          clips: value => Array.isArray(value) && value.length <= 4 && value.every(cut => matches(cut, cutSchema)),
          soundtrackSettings: optional(value => matches(value, soundtrackSchema)),
        })) return null;
    if (new Set(copy.data.clips.map(cut => cut.source_id)).size !== copy.data.clips.length) return null;
    copy.data.clips = copy.data.clips.map(cut => {
      const restored = restoreNumbers(cut, ["start_ms", "end_ms"]);
      if (cut.caption_cues) restored.caption_cues = cut.caption_cues.map(cue => restoreNumbers(cue, ["start_ms", "end_ms"]));
      return restored;
    });
    if (copy.data.soundtrackSettings) {
      copy.data.soundtrackSettings = restoreNumbers(copy.data.soundtrackSettings,
        ["start_ms", "end_ms", "offset_ms", "fade_in_ms", "fade_out_ms"]);
    }
    return copy;
  } catch {
    return null;
  }
}

export function recoveryIssue(copy, latest) {
  if (copy.base_version !== latest.version) return `Draft is based on version ${copy.base_version}; the saved sequence is version ${latest.version}.`;
  const ids = new Set(latest.sources.map(source => source.id));
  if (copy.data.clips.some(cut => !ids.has(cut.source_id)) || !!copy.data.soundtrackSettings !== !!latest.soundtrack) {
    return "This draft references media that no longer matches the saved sequence.";
  }
  return "";
}
