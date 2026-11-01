export interface GuideField { name: string; meaning: string; example: string }
export interface WorkspaceGuide { title: string; intro: string; fields: GuideField[] }
export const workspaceGuides: Record<string, WorkspaceGuide>;
export function guideFor(pathname: string, hash?: string): WorkspaceGuide & { id: string };
