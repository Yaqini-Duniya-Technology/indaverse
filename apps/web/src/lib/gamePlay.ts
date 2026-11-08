import { apiFetch } from "./api";

export interface PlayLayout {
  spawn: { x: number; y: number };
  exit: { x: number; y: number };
  platforms: { id: string; x: number; y: number; w: number; h: number }[];
  collectibles: { id: string; x: number; y: number }[];
}

export interface PlaySettings {
  project_id: number;
  layout: PlayLayout;
  version: number;
  created_at: string;
  updated_at: string;
}

export function defaultLayout(): PlayLayout {
  return {
    spawn: { x: 35, y: 336 },
    exit: { x: 742, y: 320 },
    platforms: [
      { id: "ground", x: 0, y: 370, w: 800, h: 30 },
      { id: "ledge-1", x: 150, y: 290, w: 130, h: 16 },
      { id: "ledge-2", x: 350, y: 215, w: 130, h: 16 },
      { id: "ledge-3", x: 550, y: 290, w: 130, h: 16 },
    ],
    collectibles: [
      { id: "gem-1", x: 210, y: 262 },
      { id: "gem-2", x: 410, y: 187 },
      { id: "gem-3", x: 610, y: 262 },
    ],
  };
}

export function sprintLayout(): PlayLayout {
  return {
    spawn: {x: 35, y: 336}, exit: {x: 742, y: 320},
    platforms: [{id: "ground", x: 0, y: 370, w: 800, h: 30}],
    collectibles: [
      {id: "first", x: 230, y: 350}, {id: "second", x: 550, y: 350},
    ],
  };
}

export function getPlaySettings(projectId: number): Promise<PlaySettings> {
  return apiFetch<PlaySettings>(`/api/v1/projects/${projectId}/game/play-settings`);
}

export function savePlaySettings(
  projectId: number, layout: PlayLayout, expectedVersion: number,
): Promise<PlaySettings> {
  return apiFetch<PlaySettings>(`/api/v1/projects/${projectId}/game/play-settings`, {
    method: "PUT", body: { expected_version: expectedVersion, layout },
  });
}
