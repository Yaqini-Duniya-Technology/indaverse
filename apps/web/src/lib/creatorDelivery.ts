import { apiDownload } from "./api";

export const projectPath = (id: number) => `/api/v1/projects/${id}`;

export async function downloadArtifact(path: string, media: string, filename: string) {
  const blob = await apiDownload(path, undefined, "application/json", media, AbortSignal.timeout(30000));
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function deliveryError(error: unknown) {
  return error instanceof Error ? error.message : "This action could not be completed.";
}
