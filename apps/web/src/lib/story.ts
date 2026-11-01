import { ApiError, apiFetch } from "./api";

export interface Chapter {
  id: string;
  title: string;
  content: string;
}
export interface StoryDraft {
  title: string;
  synopsis: string;
  genre: string;
  chapters: Chapter[];
}
export interface SavedStory extends StoryDraft {
  project_id: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export async function getStory(projectId: number): Promise<SavedStory | null> {
  try {
    return await apiFetch<SavedStory>(`/api/v1/projects/${projectId}/story`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404 && error.message === "No story draft saved yet.") return null;
    throw error;
  }
}

export function saveStory(projectId: number, version: number, draft: StoryDraft) {
  return apiFetch<SavedStory>(`/api/v1/projects/${projectId}/story`, {
    method: "PUT",
    body: { ...draft, expected_version: version },
  });
}
