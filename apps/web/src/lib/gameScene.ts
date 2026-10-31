import { apiFetch } from "./api";

export interface ScenePoint {
  x: number;
  y: number;
  z: number;
}

export interface ScenePlatform {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  top: number;
}

export interface SceneCollectible extends ScenePoint {
  id: string;
}

export interface SceneLayout {
  spawn: ScenePoint;
  exit: ScenePoint;
  platforms: ScenePlatform[];
  collectibles: SceneCollectible[];
}

export interface GameScene {
  project_id: number;
  layout: SceneLayout;
  version: number;
  created_at: string;
  updated_at: string;
}

export function defaultScene(): SceneLayout {
  return {
    spawn: { x: 0, y: 0, z: 7 },
    exit: { x: 0, y: 0, z: -15 },
    platforms: [
      { id: "first", x: 0, z: 5, w: 12, d: 8, top: 0 },
      { id: "middle", x: 0, z: -4, w: 12, d: 8, top: 0 },
      { id: "last", x: 0, z: -13, w: 12, d: 8, top: 0 },
      { id: "raised", x: 2, z: -4, w: 3, d: 3, top: 0.8 },
    ],
    collectibles: [
      { id: "gem-1", x: -3, y: 0.8, z: 4 },
      { id: "gem-2", x: 2, y: 1.65, z: -4 },
      { id: "gem-3", x: 0, y: 0.8, z: -13 },
    ],
  };
}

export function getGameScene(projectId: number): Promise<GameScene> {
  return apiFetch<GameScene>(`/api/v1/projects/${projectId}/game/scene`);
}

export function saveGameScene(
  projectId: number, layout: SceneLayout, expectedVersion: number,
): Promise<GameScene> {
  return apiFetch<GameScene>(`/api/v1/projects/${projectId}/game/scene`, {
    method: "PUT",
    body: { expected_version: expectedVersion, layout },
  });
}
