export const DRAFT_FORMAT = 'indaverse-studio-draft';
export function draftExport(studio, projectId, data, now = new Date().toISOString()) {
  return { format: DRAFT_FORMAT, format_version: 1, studio, source_project_id: projectId, exported_at: now, data };
}
export function recoveryPrefix(userId, projectId, studio) {
  return `indaverse:draft-recovery:v1:${userId}:${projectId}:${studio}:`;
}
export function parseRecovery(raw, context) {
  try {
    if (typeof raw !== 'string' || raw.length > 2 * 1024 * 1024) return null;
    const record = JSON.parse(raw);
    if (!record || record.recovery_version !== 1 || record.user_id !== context.userId ||
        record.project_id !== context.projectId || record.studio !== context.studio ||
        !Number.isSafeInteger(record.base_version) || record.base_version < 0 ||
        typeof record.saved_at !== 'string' || !Number.isFinite(Date.parse(record.saved_at)) ||
        !record.data || typeof record.data !== 'object' || Array.isArray(record.data)) return null;
    return record;
  } catch { return null; }
}
export function recoveryRecord(context, snapshot, now = new Date().toISOString()) {
  return { recovery_version: 1, user_id: context.userId, project_id: context.projectId,
    studio: context.studio, base_version: snapshot.version, saved_at: now, data: snapshot.data };
}
