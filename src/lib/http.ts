import { TransformError } from "./types";

export interface JsonRequest {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  authHint: string;
}

const MAX_MESSAGE_LENGTH = 300;

export async function requestJson(req: JsonRequest): Promise<unknown> {
  if (req.signal?.aborted) throw new TransformError("Cancelled");

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, req.timeoutMs);
  const onAbort = () => controller.abort();
  req.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await (req.fetchImpl ?? fetch)(req.url, {
      method: req.method ?? "GET",
      headers: { "content-type": "application/json", ...req.headers },
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) throw httpError(response.status, raw, req.authHint);
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new TransformError(`Unexpected response: ${raw.slice(0, 120) || "(empty)"}`);
    }
  } catch (err) {
    if (err instanceof TransformError) throw err;
    if (timedOut) {
      throw new TransformError(
        `Request timed out after ${Math.round(req.timeoutMs / 1000)}s`,
        "Raise Timeout in the extension preferences or try a smaller selection",
        true,
        "timeout",
      );
    }
    if (req.signal?.aborted) throw new TransformError("Cancelled");
    const reason = err instanceof Error ? err.message : String(err);
    throw new TransformError(`Network error: ${reason}`, "Check your connection and base URL", true);
  } finally {
    clearTimeout(timer);
    req.signal?.removeEventListener("abort", onAbort);
  }
}

function apiMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: unknown } | string; message?: unknown };
    const nested = typeof parsed.error === "object" ? parsed.error?.message : parsed.error;
    const message = nested ?? parsed.message;
    if (typeof message === "string" && message.trim() !== "") return message.trim();
  } catch {
    // not JSON, fall through to the raw body
  }
  return raw.trim();
}

function httpError(status: number, raw: string, authHint: string): TransformError {
  const text = apiMessage(raw);
  const message = (text === "" ? `HTTP ${status}` : text).slice(0, MAX_MESSAGE_LENGTH);
  if (status === 401 || status === 403) return new TransformError(message, authHint, false, "auth");
  if (status === 404) {
    return new TransformError(message, "The model may not exist for this key. Run Choose Model to pick one");
  }
  if (status === 429 || status === 408 || status === 409 || status >= 500) {
    return new TransformError(message, "The provider is busy or rate limiting. Try again or switch model", true);
  }
  return new TransformError(message);
}
