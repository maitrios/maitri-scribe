import { ANTHROPIC_AUTH_HINT, ANTHROPIC_BASE_URL, anthropicHeaders } from "../providers/anthropic";
import { OPENAI_AUTH_HINT, openAiHeaders, trimBaseUrl } from "../providers/openai";
import type { ProviderConfig } from "../providers";
import { requestJson } from "./http";
import { MODEL_ALIASES, defaultModel } from "./models";
import { TransformError } from "./types";
import type { ProviderId, Tier } from "./types";

export interface ModelOption {
  id: string;
  label: string;
  recommendedFor: Tier[];
}

const LIST_TIMEOUT_MS = 10_000;
const NON_CHAT = /embedding|whisper|tts|dall-e|moderation|image|audio|realtime|transcribe|search|computer-use|davinci|babbage|instruct/i;

const CLI_LABELS: Record<(typeof MODEL_ALIASES)[number], string> = {
  haiku: "Haiku (fastest)",
  sonnet: "Sonnet (balanced)",
  opus: "Opus (most capable)",
  fable: "Fable",
};

function version(id: string): number[] {
  const match = id.match(/(\d+(?:[.-]\d+)*)/);
  return match ? match[1].split(/[.-]/).map(Number) : [0];
}

export function compareVersionsDesc(a: string, b: string): number {
  const left = version(a);
  const right = version(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (right[i] ?? 0) - (left[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function newest(ids: string[], pattern: RegExp): string | undefined {
  return ids.filter((id) => pattern.test(id)).sort(compareVersionsDesc)[0];
}

export function recommend(provider: ProviderId, ids: string[]): Record<Tier, string | undefined> {
  if (provider === "anthropic") {
    return { fast: newest(ids, /haiku/i), quality: newest(ids, /sonnet/i) };
  }
  if (provider === "openai") {
    return { fast: newest(ids, /^gpt-[\d.]+-mini$/), quality: newest(ids, /^gpt-[\d.]+$/) };
  }
  return { fast: "haiku", quality: "sonnet" };
}

export function buildOptions(provider: ProviderId, ids: string[], labels: Map<string, string> = new Map()): ModelOption[] {
  const picks = recommend(provider, ids);
  return ids.map((id) => {
    const recommendedFor = (["fast", "quality"] as Tier[]).filter((tier) => picks[tier] === id);
    return { id, label: labels.get(id) ?? id, recommendedFor };
  });
}

export function cliOptions(): ModelOption[] {
  return MODEL_ALIASES.map((alias) => ({
    id: alias,
    label: CLI_LABELS[alias],
    recommendedFor: (["fast", "quality"] as Tier[]).filter((tier) => defaultModel("claude-cli", tier) === alias),
  }));
}

interface AnthropicList {
  data?: { id?: string; display_name?: string }[];
}
interface OpenAiList {
  data?: { id?: string; created?: number }[];
}

export async function listModels(
  provider: ProviderId,
  config: ProviderConfig,
  signal?: AbortSignal,
  fetchImpl?: typeof fetch,
): Promise<ModelOption[]> {
  if (provider === "claude-cli") return cliOptions();

  if (provider === "anthropic") {
    if (!config.anthropicApiKey) throw new TransformError("No Anthropic API key", ANTHROPIC_AUTH_HINT);
    const json = (await requestJson({
      url: `${ANTHROPIC_BASE_URL}/models?limit=100`,
      headers: anthropicHeaders(config.anthropicApiKey),
      timeoutMs: LIST_TIMEOUT_MS,
      signal,
      fetchImpl,
      authHint: ANTHROPIC_AUTH_HINT,
    })) as AnthropicList;
    const rows = (json.data ?? []).filter((row): row is { id: string; display_name?: string } => !!row.id);
    const labels = new Map(rows.map((row) => [row.id, row.display_name ?? row.id]));
    return buildOptions("anthropic", rows.map((row) => row.id), labels);
  }

  const json = (await requestJson({
    url: `${trimBaseUrl(config.openaiBaseUrl)}/models`,
    headers: openAiHeaders(config.openaiApiKey),
    timeoutMs: LIST_TIMEOUT_MS,
    signal,
    fetchImpl,
    authHint: OPENAI_AUTH_HINT,
  })) as OpenAiList;
  const rows = (json.data ?? []).filter((row): row is { id: string; created?: number } => !!row.id && !NON_CHAT.test(row.id));
  rows.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  return buildOptions("openai", rows.map((row) => row.id));
}
