import { requestJson } from "../lib/http";
import { toAnthropicId } from "../lib/models";
import { TransformError } from "../lib/types";
import type { Provider, TransformRequest, TransformResult } from "../lib/types";

export interface AnthropicOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface MessagesResponse {
  model?: string;
  content?: { type?: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
export const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 16384;

export const ANTHROPIC_AUTH_HINT = "Check the Anthropic API key in the extension preferences";

export function anthropicHeaders(apiKey: string): Record<string, string> {
  return { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION };
}

export class AnthropicProvider implements Provider {
  readonly id = "anthropic";

  constructor(private readonly opts: AnthropicOptions) {}

  async transform(req: TransformRequest): Promise<TransformResult> {
    const startedAt = Date.now();
    const models = [req.model];
    if (req.fallbackModel && req.fallbackModel !== req.model) models.push(req.fallbackModel);

    let lastError: unknown;
    for (const model of models) {
      try {
        const json = (await requestJson({
          url: `${this.opts.baseUrl ?? ANTHROPIC_BASE_URL}/messages`,
          method: "POST",
          headers: anthropicHeaders(this.opts.apiKey),
          body: {
            model: toAnthropicId(model),
            max_tokens: MAX_TOKENS,
            system: req.system,
            messages: [{ role: "user", content: `${req.instruction}\n\n<text>\n${req.text}\n</text>` }],
          },
          timeoutMs: req.timeoutMs,
          signal: req.signal,
          fetchImpl: this.opts.fetchImpl,
          authHint: ANTHROPIC_AUTH_HINT,
        })) as MessagesResponse;
        return toResult(json, model, Date.now() - startedAt);
      } catch (err) {
        lastError = err;
        if (!(err instanceof TransformError) || !err.retryable || err.kind === "timeout") throw err;
      }
    }
    throw lastError;
  }
}

function toResult(json: MessagesResponse, model: string, durationMs: number): TransformResult {
  const text = (json.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("")
    .trim();
  if (text === "") throw new TransformError("Claude returned an empty result", undefined, true);
  const result: TransformResult = { text, model: json.model ?? model, durationMs };
  if (typeof json.usage?.input_tokens === "number") result.inputTokens = json.usage.input_tokens;
  if (typeof json.usage?.output_tokens === "number") result.outputTokens = json.usage.output_tokens;
  return result;
}
