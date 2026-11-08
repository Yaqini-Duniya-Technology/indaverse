export const MAX_CUES_PER_CLIP = 6;
export const MAX_CUES = 16;
export const MAX_SRT_BYTES = 16 * 1024;

export function validateCues(cues, duration, limit = MAX_CUES_PER_CLIP) {
  if (cues.length > limit) return `Use at most ${limit} timed captions.`;
  let end = 0;
  for (const cue of [...cues].sort((a, b) => a.start_ms - b.start_ms)) {
    if (!Number.isInteger(cue.start_ms) || !Number.isInteger(cue.end_ms) || cue.start_ms < 0 ||
        cue.end_ms > duration || cue.end_ms - cue.start_ms < 100) {
      return "Each timed caption must last at least 0.1 seconds and fit inside the cut.";
    }
    if (cue.start_ms < end) return "Timed captions in the same clip cannot overlap.";
    const lines = cue.text.split("\n");
    if (Array.from(cue.text).length > 90 || lines.length > 2 ||
        lines.some(line => !line.trim() || /[\p{C}\p{Z}]/u.test(line.replaceAll(" ", "")))) {
      return "Enter one or two nonempty lines of caption text (90 characters total).";
    }
    end = cue.end_ms;
  }
  return "";
}

function parseTime(value) {
  const match = /^(\d{2}):([0-5]\d):([0-5]\d),(\d{3})$/.exec(value);
  if (!match) throw new Error("Use SubRip timestamps such as 00:00:01,250.");
  const [, h, m, s, ms] = match.map(Number);
  return ((h * 60 + m) * 60 + s) * 1000 + ms;
}

export function parseSrt(raw, duration, limit = MAX_CUES_PER_CLIP) {
  if (new TextEncoder().encode(raw).length > MAX_SRT_BYTES) throw new Error("Choose an SRT file up to 16 KiB.");
  const content = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!content) throw new Error("This SRT file has no captions.");
  const cues = content.split(/\n[ \t]*\n+/).map(block => {
    const [number, timing, ...lines] = block.split("\n");
    const parts = timing?.trim().split(/ +--> +/);
    if (!/^\d+$/.test(number.trim()) || parts?.length !== 2 || !lines.length) {
      throw new Error("Use a numbered SubRip (.srt) file with plain caption text.");
    }
    const text = lines.map(line => line.trim()).join("\n")
      .replace(/&(amp|lt|gt);/g, (_, entity) => ({amp: "&", lt: "<", gt: ">"})[entity]);
    return {start_ms: parseTime(parts[0]), end_ms: parseTime(parts[1]), text, position: "bottom"};
  }).sort((a, b) => a.start_ms - b.start_ms);
  const error = validateCues(cues, duration, limit);
  if (error) throw new Error(error);
  return cues;
}

export function mapSequenceSrt(raw, durations) {
  if (!durations.length || durations.some(duration => !Number.isSafeInteger(duration) || duration < 500)) {
    throw new Error("Set valid cut ranges before importing subtitles.");
  }
  const cues = parseSrt(raw, durations.reduce((a, b) => a + b, 0), MAX_CUES);
  let offset = 0;
  const groups = durations.map(duration => {
    const start = offset;
    offset += duration;
    return cues.filter(cue => cue.start_ms < offset && cue.end_ms > start).map(cue => ({
      ...cue, start_ms: Math.max(start, cue.start_ms) - start,
      end_ms: Math.min(offset, cue.end_ms) - start,
    }));
  });
  if (groups.flat().length > MAX_CUES) throw new Error("Splitting across cuts would exceed sixteen timed captions.");
  groups.forEach((group, index) => {
    const error = validateCues(group, durations[index]);
    if (error) throw new Error(`Clip ${index + 1}: ${error}`);
  });
  return groups;
}
