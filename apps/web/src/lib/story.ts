import { apiFetch } from "./api";

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
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const response = await fetch(`${base}/api/v1/projects/${projectId}/story`, {
    credentials: "include",
  });
  const data = await response.json();
  if (response.status === 404 && data.detail === "No story draft saved yet.") return null;
  if (!response.ok) throw new Error(data.detail || "Unable to load story.");
  return data as SavedStory;
}

export function saveStory(projectId: number, version: number, draft: StoryDraft) {
  return apiFetch<SavedStory>(`/api/v1/projects/${projectId}/story`, {
    method: "PUT",
    body: { ...draft, expected_version: version },
  });
}
