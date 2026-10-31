import { apiFetch } from "./api";

export interface StoryCharacter {
  id: string;
  name: string;
  role: string;
  description: string;
  portrait_image_id: number | null;
}

export interface SavedCharacters {
  project_id: number;
  characters: StoryCharacter[];
  version: number;
  updated_at: string | null;
}

export function getCharacters(projectId: number) {
  return apiFetch<SavedCharacters>(
    `/api/v1/projects/${projectId}/story/characters`,
  );
}

export function saveCharacters(
  projectId: number, version: number, characters: StoryCharacter[],
) {
  return apiFetch<SavedCharacters>(
    `/api/v1/projects/${projectId}/story/characters`,
    { method: "PUT", body: { expected_version: version, characters } },
  );
}
