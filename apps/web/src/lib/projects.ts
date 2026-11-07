import { apiFetch } from "./api";

export type ProjectType =
  | "music"
  | "video"
  | "music_video"
  | "voice"
  | "story"
  | "game"
  | "website"
  | "app";

export type ProjectVisibility =
  | "private"
  | "unlisted"
  | "public";

export interface Project {
  archived_at?: string | null;
  cover_image_id?: number | null;
  cover_version?: number;
  id: number;
  user_id: number;
  name: string;
  project_type: ProjectType;
  description: string | null;
  visibility: ProjectVisibility;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectData {
  name: string;
  project_type: ProjectType;
  description?: string;
  visibility?: ProjectVisibility;
}

export async function getProjects(): Promise<Project[]> {
  return apiFetch<Project[]>("/api/v1/projects");
}

export async function getProject(
  projectId: number,
): Promise<Project> {
  return apiFetch<Project>(
    `/api/v1/projects/${projectId}`,
  );
}

export async function createProject(
  data: CreateProjectData,
): Promise<Project> {
  return apiFetch<Project>("/api/v1/projects", {
    method: "POST",
    body: data,
  });
}

export async function deleteProject(
  projectId: number,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(
    `/api/v1/projects/${projectId}`,
    {
      method: "DELETE",
    },
  );
}
export interface UpdateProjectData {
  name?: string;
  description?: string | null;
}

export async function updateProject(
  projectId: number,
  data: UpdateProjectData,
): Promise<Project> {
  return apiFetch<Project>(`/api/v1/projects/${projectId}`, {
    method: "PATCH",
    body: data,
  });
}
