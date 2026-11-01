export type StudioKind = 'music' | 'story' | 'video' | 'software' | 'game';
export interface StudioAnalysis {
  title: string;
  metrics: { label: string; value: string }[];
  issues: string[];
  entries: { title: string; detail: string; content: string }[];
  report: string;
  csv: string;
}
export function wordCount(text?: unknown): number;
export function durationLabel(seconds?: number): string;
export function csv(rows: unknown[][]): string;
export function shotTimeline(shots: unknown[]): { number: number; title: string; start: number; end: number; duration: number; description: string; camera: string }[];
export function analyzeStudio(kind: StudioKind, data: unknown): StudioAnalysis;
