import { apiFetch } from "./api";

export interface PlanAssetReference {
  kind: "audio" | "song_revision" | "image" | "video_revision";
  id: number;
}

export interface PlanAssetOption extends PlanAssetReference {
  label: string;
  created_at: string;
}

export interface PlanAssetPage {
  items: PlanAssetOption[];
  has_more: boolean;
  limit: number;
  offset: number;
}

export interface PlanStep {
  title: string;
  notes: string;
  status: "todo" | "in_progress" | "done";
  assets?: PlanAssetReference[];
}

export interface ProjectPlan {
  project_id: number;
  version: number;
  brief_version: number;
  current_brief_version: number;
  stale: boolean;
  planner: string;
  brief_snapshot: Record<string, string>;
  steps: PlanStep[];
  created_at: string;
  updated_at: string;
}

export function getProjectPlan(id: number): Promise<ProjectPlan> {
  return apiFetch<ProjectPlan>(`/api/v1/projects/${id}/plan`);
}

export function createProjectPlan(id: number, briefVersion: number): Promise<ProjectPlan> {
  return apiFetch<ProjectPlan>(`/api/v1/projects/${id}/plan`, {
    method: "POST", body: { expected_brief_version: briefVersion },
  });
}

export function saveProjectPlan(
  id: number, version: number, steps: PlanStep[],
): Promise<ProjectPlan> {
  return apiFetch<ProjectPlan>(`/api/v1/projects/${id}/plan`, {
    method: "PUT", body: { expected_version: version, steps },
  });
}

export function reviewProjectPlan(
  id: number, version: number, briefVersion: number,
): Promise<ProjectPlan> {
  return apiFetch<ProjectPlan>(`/api/v1/projects/${id}/plan/review`, {
    method: "POST",
    body: {
      expected_version: version,
      expected_brief_version: briefVersion,
    },
  });
}

export function getPlanAssets(
  projectId: number,
  kind: PlanAssetReference["kind"],
  offset = 0,
): Promise<PlanAssetPage> {
  return apiFetch<PlanAssetPage>(
    `/api/v1/projects/${projectId}/plan/assets?kind=${kind}&limit=20&offset=${offset}`,
  );
}

export interface PlanAssetDetail extends PlanAssetReference {
  label: string;
  created_at: string;
  available: boolean;
  file_size: number | null;
  snapshot: Record<string, unknown> | null;
}

export function getPlanAssetDetail(
  projectId: number, asset: PlanAssetReference,
): Promise<PlanAssetDetail> {
  return apiFetch<PlanAssetDetail>(
    `/api/v1/projects/${projectId}/plan/assets/${asset.kind}/${asset.id}`,
  );
}
