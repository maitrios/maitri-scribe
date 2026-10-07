export const MODEL_ALIASES = ["haiku", "sonnet", "opus", "fable"] as const;

type ModelAlias = (typeof MODEL_ALIASES)[number];

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
