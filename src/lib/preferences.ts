import { getPreferenceValues } from "@vicinae/api";
import { normalizeModel } from "./models";
import type { PromptOptions } from "./prompts";
import type { ProviderConfig } from "../providers";
import type { DiffStyle, Effort, ProviderChoice } from "./types";

export interface CommonPrefs {
  provider: ProviderChoice;
  claudePath?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  fastMode: boolean;
  fallbackModel: string;
  effort: Effort;
  diffStyle: DiffStyle;
  avoidEmDashes: boolean;
  styleRules?: string;
  timeoutMs: number;
  maxCostUsd?: number;
}

const EFFORTS: readonly Effort[] = ["low", "medium", "high"];
const PROVIDERS: readonly ProviderChoice[] = ["auto", "claude-cli", "anthropic", "openai"];
const DIFF_STYLES: readonly DiffStyle[] = ["rich", "markdown", "unified"];
const DEFAULT_TIMEOUT_MS = 60_000;
const MIN_TIMEOUT_SECONDS = 5;

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function pickOne<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function parseTimeoutMs(value: unknown): number {
  const seconds = Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(seconds) || seconds < MIN_TIMEOUT_SECONDS) return DEFAULT_TIMEOUT_MS;
  return Math.round(seconds * 1000);
}

function parseMaxCost(value: unknown): number | undefined {
  const cost = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(cost) && cost > 0 ? cost : undefined;
}

export function readCommonPrefs(): CommonPrefs {
  const raw = getPreferenceValues<Preferences>();
  return {
    provider: pickOne(raw.provider, PROVIDERS, "auto"),
    claudePath: optionalText(raw.claudePath),
    anthropicApiKey: optionalText(raw.anthropicApiKey),
    openaiApiKey: optionalText(raw.openaiApiKey),
    openaiBaseUrl: optionalText(raw.openaiBaseUrl),
    fastMode: typeof raw.fastMode === "boolean" ? raw.fastMode : true,
    fallbackModel: normalizeModel(optionalText(raw.fallbackModel), "sonnet"),
    effort: pickOne(raw.effort, EFFORTS, "low"),
    diffStyle: pickOne(raw.diffStyle, DIFF_STYLES, "rich"),
    avoidEmDashes: typeof raw.avoidEmDashes === "boolean" ? raw.avoidEmDashes : true,
    styleRules: optionalText(raw.styleRules),
    timeoutMs: parseTimeoutMs(raw.timeoutSeconds),
    maxCostUsd: parseMaxCost(raw.maxCostUsd),
  };
}

export function readModelPref(raw: string | null | undefined): string | undefined {
  return optionalText(raw);
}

export function providerConfig(prefs: CommonPrefs): ProviderConfig {
  return {
    provider: prefs.provider,
    claudePath: prefs.claudePath,
    anthropicApiKey: prefs.anthropicApiKey,
    openaiApiKey: prefs.openaiApiKey,
    openaiBaseUrl: prefs.openaiBaseUrl,
    fast: prefs.fastMode,
  };
}

export function promptOptions(prefs: CommonPrefs, override?: string): PromptOptions {
  return {
    avoidEmDashes: prefs.avoidEmDashes,
    styleRules: prefs.styleRules ?? null,
    override: override ?? null,
  };
}
