import type { ProviderId, Tier } from "./types";

export const MODEL_ALIASES = ["haiku", "sonnet", "opus", "fable"] as const;

type ModelAlias = (typeof MODEL_ALIASES)[number];

const ANTHROPIC_IDS: Record<ModelAlias, string> = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-5-5",
  opus: "claude-opus-5-5",
  fable: "claude-fable-5-1",
};

const OPENAI_DEFAULTS: Record<Tier, string> = { fast: "gpt-5-mini", quality: "gpt-5" };
const CLI_DEFAULTS: Record<Tier, string> = { fast: "haiku", quality: "sonnet" };

export const OPENAI_BASE_URL = "https://api.openai.com/v1";

function asAlias(value: string): ModelAlias | undefined {
  const lower = value.toLowerCase();
  return MODEL_ALIASES.find((alias) => alias === lower);
}

export function normalizeModel(input: string | null | undefined, fallback: string): string {
  const trimmed = (input ?? "").trim();
  if (trimmed === "") return fallback;
  return asAlias(trimmed) ?? trimmed;
}

export function supportsEffort(model: string): boolean {
  return !model.toLowerCase().includes("haiku");
}

export function toAnthropicId(model: string): string {
  const alias = asAlias(model.trim());
  return alias ? ANTHROPIC_IDS[alias] : model.trim();
}

export function defaultModel(provider: ProviderId, tier: Tier): string {
  if (provider === "claude-cli") return CLI_DEFAULTS[tier];
  if (provider === "anthropic") return ANTHROPIC_IDS[CLI_DEFAULTS[tier] as ModelAlias];
  return OPENAI_DEFAULTS[tier];
}

export function tierFor(promptId: string): Tier {
  return promptId === "fix-grammar" ? "fast" : "quality";
}

export function pickFallback(primary: string, preferred?: string | null): string {
  const wanted = normalizeModel(preferred, "");
  if (wanted !== "" && wanted.toLowerCase() !== primary.trim().toLowerCase()) return wanted;
  return supportsEffort(primary) ? "haiku" : "sonnet";
}

export function describeModel(model: string): string {
  const lower = model.toLowerCase();
  const alias = MODEL_ALIASES.find((candidate) => lower.includes(candidate));
  return alias ? alias.charAt(0).toUpperCase() + alias.slice(1) : model;
}

export function firstDefined(candidates: readonly (string | null | undefined)[], fallback: string): string {
  for (const candidate of candidates) {
    const trimmed = (candidate ?? "").trim();
    if (trimmed !== "") return trimmed;
  }
  return fallback;
}
