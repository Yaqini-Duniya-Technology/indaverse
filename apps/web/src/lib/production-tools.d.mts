export const GAME_GENRES: string[];
export function musicTiming(bpm: number, bars: number, beats: number): { seconds: number; beatSeconds: number } | null;
export function repeatedLines(data: unknown): {line: string; count: number}[];
export function chapterPlan(chapters?: {title: string; content: string}[], speed?: number, target?: number): {title: string; words: number; minutes: number; remaining: number; progress: number}[];
export function routeAudit(pages?: {path: string; name: string; sections?: unknown[]}[]): {path: string; name: string; duplicate: boolean; sections: number}[];
export function productionRows(kind: string, data: unknown, options?: {filter?: string; speed?: number; target?: number; emptyOnly?: boolean; minimum?: number}): {title: string; detail: string; content: string}[];
