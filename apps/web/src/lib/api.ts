const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8002";

type ApiOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  rawBody?: Blob;
};

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

function errorMessage(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("detail" in data)) {
    return null;
  }

  const detail = (data as { detail: unknown }).detail;
  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    const messages = detail.map((item: unknown) => {
      if (typeof item === "object" && item !== null && "msg" in item) {
        return String((item as { msg: unknown }).msg);
      }
      return "";
    }).filter(Boolean);

    return messages.length ? messages.join(" ") : null;
  }

  return null;
}

export async function apiFetch<T>(
  endpoint: string,
  options: ApiOptions = {},
): Promise<T> {
  const { body, rawBody, headers, ...rest } = options;
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Content-Type", rawBody?.type || "application/json");

  // Connection recovery messages
  const method = (rest.method ?? "GET").toUpperCase();
  const reading = method === "GET" || method === "HEAD";
  let response: Response;

  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      ...rest,
      credentials: "include",
      headers: requestHeaders,
      body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch (error) {
    // Preserve deliberate cancellation.
    if (rest.signal?.aborted ||
        (error instanceof Error && error.name === "AbortError")) {
      throw error;
    }

    const guidance = typeof navigator !== "undefined" && !navigator.onLine
      ? "Your browser appears offline. Check your connection."
      : "Cannot reach IndaVerse. Make sure its API is running, then try again.";

    throw new ApiError(
      reading
        ? `${guidance} Use Retry to reload.`
        : `${guidance} The result of your request could not be confirmed. Keep your draft and check the saved version before submitting again.`,
      0,
    );
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new ApiError(
      errorMessage(data) || `Request failed (${response.status}). Please try again.`,
      response.status,
    );
  }

  return data as T;
}

// Binary exports return private, typed attachments instead of JSON.
export async function apiDownload(
  endpoint: string,
  input: Blob | undefined,
  inputType: string,
  outputType: string,
  signal: AbortSignal,
): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      method: input === undefined ? "GET" : "POST", credentials: "include", body: input,
      headers: { "Content-Type": inputType }, signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ApiError("Cannot reach IndaVerse. Your source file has not been changed.", 0);
  }
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    throw new ApiError(errorMessage(data) || `Export failed (${response.status}).`, response.status);
  }
  if (response.headers.get("content-type") !== outputType) {
    throw new ApiError("IndaVerse returned an unexpected export format.", response.status);
  }
  const file = await response.blob();
  if (!file.size) throw new ApiError("IndaVerse returned an empty export.", response.status);
  return file;
}
