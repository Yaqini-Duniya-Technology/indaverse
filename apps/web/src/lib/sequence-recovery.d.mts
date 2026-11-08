import type { CaptionCue } from "./video-captions.mjs";
export type Cut = {
  source_id: string; start_ms: number; end_ms: number; title?: string; muted?: boolean;
  volume_percent?: number; fade_edges?: boolean; framing?: "fit" | "fill";
  title_position?: "top" | "bottom"; title_duration_ms?: number; caption?: string; caption_cues?: CaptionCue[];
};
export type SoundtrackSettings = {
  start_ms: number; end_ms: number; offset_ms: number; volume_percent: number;
  fade_in_ms: number; fade_out_ms: number; mode: "mix" | "replace";
};
export type SequenceDraft = { clips: Cut[]; soundtrackSettings?: SoundtrackSettings };
export type SequenceRecoveryCopy = { base_version: number; saved_at: string; data: SequenceDraft };
export function sequenceRecoveryPrefix(userId: number, projectId: number): string;
export function encodeSequenceRecovery(userId: number, projectId: number, baseVersion: number, data: SequenceDraft, now?: string): string;
export function parseSequenceRecovery(raw: string | null, userId: number, projectId: number): SequenceRecoveryCopy | null;
export function recoveryIssue(copy: SequenceRecoveryCopy, latest: {
  version: number; sources: {id: string}[]; soundtrack: unknown;
}): string;
