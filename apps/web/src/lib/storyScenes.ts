import { apiFetch } from "./api";

export interface StoryScene {
  id: string;
  title: string;
  setting: string;
  summary: string;
  chapter_id: string | null;
  character_ids: string[];
  image_id: number | null;
}
export interface SavedScenes {
  project_id: number;
  scenes: StoryScene[];
  version: number;
  updated_at: string | null;
}
export function getScenes(projectId: number) {
  return apiFetch<SavedScenes>(`/api/v1/projects/${projectId}/story/scenes`);
}
export function saveScenes(projectId: number, version: number, scenes: StoryScene[]) {
  return apiFetch<SavedScenes>(`/api/v1/projects/${projectId}/story/scenes`, {
    method: "PUT", body: { expected_version: version, scenes },
  });
}
