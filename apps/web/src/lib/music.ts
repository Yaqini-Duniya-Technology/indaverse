import { apiFetch } from "./api";

/* =========================================================
   MUSIC PROJECT TYPES
   ========================================================= */

export interface MusicProject {
  id: number;
  project_id: number;

  title: string;
  artist: string | null;
  genre: string | null;
  mood: string | null;
  bpm: number | null;

  lyrics_intro: string | null;
  lyrics_verse_1: string | null;
  lyrics_chorus: string | null;
  lyrics_verse_2: string | null;
  lyrics_bridge: string | null;
  lyrics_outro: string | null;

  created_at: string;
  updated_at: string;
}

export interface MusicProjectData {
  title: string;
  artist?: string;
  genre?: string;
  mood?: string;
  bpm?: number;

  lyrics_intro?: string;
  lyrics_verse_1?: string;
  lyrics_chorus?: string;
  lyrics_verse_2?: string;
  lyrics_bridge?: string;
  lyrics_outro?: string;
}

/* =========================================================
   AUDIO TYPES
   ========================================================= */

export interface UploadedAudio {
  id: number;
  project_id: number;

  original_filename: string;
  stored_filename: string;
  file_path: string;

  mime_type: string;
  file_size: number;

  created_at: string;
}

/*
 * The API may return either:
 *
 *   [
 *     {...audio}
 *   ]
 *
 * or:
 *
 *   {...audio}
 *
 * This type keeps the frontend flexible.
 */
export type ProjectAudioResponse =
  | UploadedAudio[]
  | UploadedAudio
  | null;

/* =========================================================
   API BASE URL
   ========================================================= */

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

/* =========================================================
   GET MUSIC PROJECT
   ========================================================= */

export async function getMusicProject(
  projectId: number,
): Promise<MusicProject> {
  return apiFetch<MusicProject>(
    `/api/v1/projects/${projectId}/music`,
  );
}

/* =========================================================
   CREATE MUSIC PROJECT
   ========================================================= */

export async function createMusicProject(
  projectId: number,
  data: MusicProjectData,
): Promise<MusicProject> {
  return apiFetch<MusicProject>(
    `/api/v1/projects/${projectId}/music`,
    {
      method: "POST",
      body: data,
    },
  );
}

/* =========================================================
   UPDATE MUSIC PROJECT
   ========================================================= */

export async function updateMusicProject(
  projectId: number,
  data: Partial<MusicProjectData>,
  expectedUpdatedAt: string,
): Promise<MusicProject> {
  return apiFetch<MusicProject>(
    `/api/v1/projects/${projectId}/music`,
    {
      method: "PATCH",
      body: { ...data, expected_updated_at: expectedUpdatedAt },
    },
  );
}

/* =========================================================
   DELETE MUSIC PROJECT
   ========================================================= */

export async function deleteMusicProject(
  projectId: number,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(
    `/api/v1/projects/${projectId}/music`,
    {
      method: "DELETE",
    },
  );
}

/* =========================================================
   GET PROJECT AUDIO
   ========================================================= */

export async function getProjectAudio(
  projectId: number,
): Promise<UploadedAudio[]> {
  const response =
    await apiFetch<ProjectAudioResponse>(
      `/api/v1/projects/${projectId}/audio`,
    );

  if (!response) {
    return [];
  }

  if (Array.isArray(response)) {
    return response;
  }

  return [response];
}

/* =========================================================
   UPLOAD AUDIO
   ========================================================= */

export async function uploadAudio(
  projectId: number,
  file: File,
): Promise<UploadedAudio> {
  if (!file) {
    throw new Error("Please select an audio file.");
  }

  const formData = new FormData();

  formData.append("file", file);

  const response = await fetch(
    `${API_URL}/api/v1/projects/${projectId}/audio`,
    {
      method: "POST",

      /*
       * IMPORTANT:
       * Do not manually set Content-Type here.
       * The browser automatically adds the correct
       * multipart/form-data boundary.
       */
      credentials: "include",

      body: formData,
    },
  );

  let data: unknown = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    let message = "Audio upload failed.";

    if (
      typeof data === "object" &&
      data !== null &&
      "detail" in data
    ) {
      message = String(
        (data as { detail: unknown }).detail,
      );
    }

    throw new Error(message);
  }

  if (
    typeof data !== "object" ||
    data === null
  ) {
    throw new Error(
      "Audio upload succeeded, but the server returned an invalid response.",
    );
  }

  return data as UploadedAudio;
}

/* =========================================================
   DELETE AUDIO
   ========================================================= */

export async function deleteAudio(
  projectId: number,
  audioId: number,
): Promise<{
  message: string;
  audio_id: number;
}> {
  return apiFetch<{
    message: string;
    audio_id: number;
  }>(
    `/api/v1/projects/${projectId}/audio/${audioId}`,
    {
      method: "DELETE",
    },
  );
}

/* =========================================================
   AI MUSIC GENERATION
   ========================================================= */

export interface MusicGenerationRequest {
  prompt: string;
  output_type: "vocal" | "instrumental";
  language: string;
  genre?: string;
  mood?: string;
  bpm?: number;
}

export interface MusicGenerationResponse {
  provider: string;
  provider_job_id: string;
  status: string;
  audio_url: string | null;
  duration_seconds: number | null;
  title: string | null;
  error_message: string | null;
}

export async function generateMusic(
  projectId: number,
  data: MusicGenerationRequest,
): Promise<MusicGenerationResponse> {
  return apiFetch<MusicGenerationResponse>(
    `/api/v1/projects/${projectId}/music/generate`,
    {
      method: "POST",
      body: data,
    },
  );
}
