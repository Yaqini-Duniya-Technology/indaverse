import { apiFetch } from "./api";

export interface CreativeBrief {
  project_id: number;
  version: number;
  goal: string;
  audience: string;
  style: string;
  constraints: string;
}

export type BriefDraft = Pick<
  CreativeBrief, "goal" | "audience" | "style" | "constraints"
>;

export function getCreativeBrief(projectId: number): Promise<CreativeBrief> {
  return apiFetch<CreativeBrief>(`/api/v1/projects/${projectId}/brief`);
}

export function saveCreativeBrief(
  projectId: number,
  draft: BriefDraft,
  expectedVersion: number,
): Promise<CreativeBrief> {
  return apiFetch<CreativeBrief>(`/api/v1/projects/${projectId}/brief`, {
    method: "PUT",
    body: { ...draft, expected_version: expectedVersion },
  });
}
