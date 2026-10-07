import { requestJson } from "../lib/http";
import { OPENAI_BASE_URL } from "../lib/models";
import { TransformError } from "../lib/types";
import type { Provider, TransformRequest, TransformResult } from "../lib/types";

export interface OpenAiOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface ChatResponse {
  model?: string;
  choices?: { message?: { content?: unknown } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export const OPENAI_AUTH_HINT = "Check the OpenAI API key and base URL in the extension preferences";

export function trimBaseUrl(url: string | undefined): string {
  return (url ?? "").trim().replace(/\/+$/, "") || OPENAI_BASE_URL;
}

export function openAiHeaders(apiKey: string | undefined): Record<string, string> {
  return apiKey ? { authorization: `Bearer ${apiKey}` } : {};
}

export class OpenAiProvider implements Provider {
  readonly id = "openai";

  constructor(private readonly opts: OpenAiOptions) {}

  async transform(req: TransformRequest): Promise<TransformResult> {
    const startedAt = Date.now();
    const json = (await requestJson({
      url: `${trimBaseUrl(this.opts.baseUrl)}/chat/completions`,
      method: "POST",
      headers: openAiHeaders(this.opts.apiKey),
      body: {
        model: req.model,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: `${req.instruction}\n\n<text>\n${req.text}\n</text>` },
        ],
      },
      timeoutMs: req.timeoutMs,
      signal: req.signal,
      fetchImpl: this.opts.fetchImpl,
      authHint: OPENAI_AUTH_HINT,
    })) as ChatResponse;

    const content = json.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content.trim() : "";
    if (text === "") throw new TransformError("The model returned an empty result", undefined, true);
    const result: TransformResult = {
      text,
      model: json.model ?? req.model,
      durationMs: Date.now() - startedAt,
    };
    if (typeof json.usage?.prompt_tokens === "number") result.inputTokens = json.usage.prompt_tokens;
    if (typeof json.usage?.completion_tokens === "number") result.outputTokens = json.usage.completion_tokens;
    return result;
  }
}
