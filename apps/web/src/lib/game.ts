import { apiFetch } from "./api";

export interface GameCharacter {
  id: string;
  name: string;
  role: "player" | "ally" | "enemy" | "npc";
  image_id?: number | null;
  description: string;
}

export interface GameLevel {
  id: string;
  title: string;
  setting: string;
  objective: string;
  challenges: string;
  image_id?: number | null;
}

export const GAME_ASSET_KINDS = [
  "model", "sprite", "texture", "material", "animation", "vfx",
  "audio", "ui", "environment", "prefab", "shader", "other",
] as const;

export type GameAssetKind = typeof GAME_ASSET_KINDS[number];

export interface GameAsset {
  id: string;
  title: string;
  kind: GameAssetKind;
  description: string;
}

export interface GameData {
  title: string;
  dimension: "2d" | "3d";
  genre: string;
  concept: string;
  core_loop: string;
  controls: string;
  characters: GameCharacter[];
  levels: GameLevel[];
  assets: GameAsset[];
}

export interface GameProject extends GameData {
  project_id: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export function getGame(projectId: number): Promise<GameProject> {
  return apiFetch<GameProject>(`/api/v1/projects/${projectId}/game`);
}

export function saveGame(
  projectId: number, data: GameData, expectedVersion: number,
): Promise<GameProject> {
  return apiFetch<GameProject>(`/api/v1/projects/${projectId}/game`, {
    method: "PUT",
    body: { ...data, expected_version: expectedVersion },
  });
}

export interface GameRevision {
  id: number;
  project_id: number;
  version: number;
  reason: string;
  snapshot: GameData;
  created_at: string;
}

export interface GameRevisionPage {
  items: GameRevision[];
  total: number;
  limit: number;
  offset: number;
}

export function listGameRevisions(projectId: number, offset = 0): Promise<GameRevisionPage> {
  return apiFetch<GameRevisionPage>(
    `/api/v1/projects/${projectId}/game/revisions?limit=10&offset=${offset}`,
  );
}
