import { getPreferenceValues } from "@vicinae/api";
import { normalizeModel } from "./models";
import type { PromptOptions } from "./prompts";
import type { DiffStyle, Effort } from "./types";

export interface CommonPrefs {
  claudePath?: string;
  fallbackModel: string;
  effort: Effort;
  diffStyle: DiffStyle;
  avoidEmDashes: boolean;
  styleRules?: string;
  timeoutMs: number;
  maxCostUsd?: number;
}

const EFFORTS: readonly Effort[] = ["low", "medium", "high"];
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
    claudePath: optionalText(raw.claudePath),
    fallbackModel: normalizeModel(optionalText(raw.fallbackModel), "sonnet"),
    effort: pickOne(raw.effort, EFFORTS, "low"),
    diffStyle: pickOne(raw.diffStyle, DIFF_STYLES, "rich"),
    avoidEmDashes: typeof raw.avoidEmDashes === "boolean" ? raw.avoidEmDashes : true,
    styleRules: optionalText(raw.styleRules),
    timeoutMs: parseTimeoutMs(raw.timeoutSeconds),
    maxCostUsd: parseMaxCost(raw.maxCostUsd),
  };
}

export function readModelPref(raw: string | null | undefined, fallback: string): string {
  return normalizeModel(raw, fallback);
}

export function promptOptions(prefs: CommonPrefs, override?: string): PromptOptions {
  return {
    avoidEmDashes: prefs.avoidEmDashes,
    styleRules: prefs.styleRules ?? null,
    override: override ?? null,
  };
}
