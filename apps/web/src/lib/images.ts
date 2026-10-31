import { apiFetch } from "./api";
import type { Project } from "./projects";

export type ImageCategory = "character" | "scene" | "location" | "reference";
export interface ProjectImage {
  id: number;
  project_id: number;
  label: string;
  category: ImageCategory;
  width: number;
  height: number;
  created_at: string;
}
export interface ImagePage {
  items: ProjectImage[];
  has_more: boolean;
}
export const IMAGE_API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function listImages(projectId: number, offset = 0) {
  return apiFetch<ImagePage>(`/api/v1/projects/${projectId}/images?limit=20&offset=${offset}`);
}
export function setProjectCover(projectId: number, version: number, imageId: number | null) {
  return apiFetch<Project>(`/api/v1/projects/${projectId}/cover`, {
    method: "PUT", body: { expected_version: version, image_id: imageId },
  });
}
export async function uploadProjectImage(
  projectId: number, file: File, label: string, category: ImageCategory,
): Promise<ProjectImage> {
  const form = new FormData();
  form.append("file", file);
  form.append("label", label);
  form.append("category", category);
  const response = await fetch(`${IMAGE_API_URL}/api/v1/projects/${projectId}/images`, {
    method: "POST", credentials: "include", body: form,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(
    typeof data.detail === "string" ? data.detail : "Unable to upload image.",
  );
  return data as ProjectImage;
}
