export type CaptionCue = {start_ms: number; end_ms: number; text: string; position?: "top" | "bottom"};
export const MAX_CUES_PER_CLIP: number;
export const MAX_CUES: number;
export const MAX_SRT_BYTES: number;
export function validateCues(cues: CaptionCue[], duration: number): string;
export function parseSrt(raw: string, duration: number): CaptionCue[];
