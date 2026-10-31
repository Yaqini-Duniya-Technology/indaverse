import { apiFetch } from "./api";

export type ImagePurpose =
  | "character" | "scene" | "location" | "reference" | "cover";

export interface ImageRequestData {
  label: string;
  purpose: ImagePurpose;
  prompt: string;
}

export interface ImageRequest extends ImageRequestData {
  id: number;
  project_id: number;
  provider: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

export interface ImageRequestPage {
  items: ImageRequest[];
  has_more: boolean;
  limit: number;
  offset: number;
}

export function saveImageRequest(projectId: number, data: ImageRequestData) {
  return apiFetch<ImageRequest>(
    `/api/v1/projects/${projectId}/image-jobs`,
    { method: "POST", body: data },
  );
}

export function getImageRequests(projectId: number, offset = 0) {
  return apiFetch<ImageRequestPage>(
    `/api/v1/projects/${projectId}/image-jobs?limit=10&offset=${offset}`,
  );
}
