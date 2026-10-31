const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8002";

type ApiOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
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
  const { body, headers, ...rest } = options;
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Content-Type", "application/json");

  // Connection recovery messages
  const method = (rest.method ?? "GET").toUpperCase();
  const reading = method === "GET" || method === "HEAD";
  let response: Response;

  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      ...rest,
      credentials: "include",
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
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
