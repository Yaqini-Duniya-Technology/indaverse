import { apiFetch } from "./api";

export interface VideoShot {
  id: string;
  title: string;
  description: string;
  camera_direction: string;
  duration_seconds: number;
  image_id: number | null;
}
export interface VideoData {
  title: string;
  script: string;
  aspect_ratio: "16:9" | "9:16" | "1:1";
  shots: VideoShot[];
}
export interface VideoProject extends VideoData {
  project_id: number;
  version: number;
  created_at: string;
  updated_at: string;
}
export function getVideo(projectId: number) {
  return apiFetch<VideoProject>(`/api/v1/projects/${projectId}/video`);
}
export function saveVideo(projectId: number, version: number, data: VideoData) {
  return apiFetch<VideoProject>(`/api/v1/projects/${projectId}/video`, {
    method: "PUT", body: { ...data, expected_version: version },
  });
}

export interface VideoRevision {
  id: number;
  project_id: number;
  version: number;
  reason: string;
  snapshot: VideoData;
  created_at: string;
}
export interface VideoRevisionPage {
  items: VideoRevision[];
  total: number;
  limit: number;
  offset: number;
}
export function listVideoRevisions(projectId: number, offset = 0) {
  return apiFetch<VideoRevisionPage>(
    `/api/v1/projects/${projectId}/video/revisions?limit=10&offset=${offset}`,
  );
}
