export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
/** Requests give up after this long, so a stalled connection never freezes the screen. */
const TIMEOUT_MS = 20000;

export async function api<T>(
  path: string,
  data?: unknown,
  method = "GET",
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: data === undefined ? {} : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: controller.signal,
    });
  } catch (error) {
    // Network failures stay plain Errors so offline-capable screens can queue work.
    throw new Error(
      controller.signal.aborted
        ? "The server took too long to respond. Check the connection and try again."
        : error instanceof Error && !navigator.onLine
          ? "You are offline. Reconnect and try again."
          : "Could not reach Lenore. Check the connection and try again.",
    );
  } finally {
    clearTimeout(timer);
  }
  // Proxies and gateways can answer with HTML; never let that surface as a parse error.
  const text = await response.text();
  let result: unknown = null;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    result = null;
  }
  if (!response.ok) {
    // An expired or revoked session anywhere sends the app back to sign-in.
    if (response.status === 401 && !path.startsWith("/session"))
      window.dispatchEvent(new Event("lenore:signed-out"));
    const message =
      result &&
      typeof result === "object" &&
      "error" in result &&
      typeof result.error === "string"
        ? result.error
        : response.status >= 500
          ? "Lenore is temporarily unavailable. Please try again shortly."
          : "Request failed. Please try again.";
    throw new ApiError(message, response.status);
  }
  return result as T;
}
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
