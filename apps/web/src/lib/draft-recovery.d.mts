export type RecoveryStudio = 'story' | 'video' | 'software';
export interface RecoveryContext { userId: number; projectId: number; studio: RecoveryStudio }
export interface RecoveryRecord { recovery_version: 1; user_id: number; project_id: number; studio: RecoveryStudio; base_version: number; saved_at: string; data: unknown }
export const DRAFT_FORMAT: string;
export function draftExport(studio: RecoveryStudio, projectId: number, data: unknown, now?: string): object;
export function recoveryPrefix(userId: number, projectId: number, studio: RecoveryStudio): string;
export function parseRecovery(raw: string | null, context: RecoveryContext): RecoveryRecord | null;
export function recoveryRecord(context: RecoveryContext, snapshot: {version: number; data: unknown}, now?: string): RecoveryRecord;
