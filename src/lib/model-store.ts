import { LocalStorage } from "@vicinae/api";
import { ALL_COMMANDS, resolveModelWith, type ResolveModelOptions } from "./model-resolve";
import type { ProviderId } from "./types";

export { ALL_COMMANDS };

function key(provider: ProviderId, scope: string): string {
  return `model:${provider}:${scope}`;
}

async function read(provider: ProviderId, scope: string): Promise<string | undefined> {
  try {
    return (await LocalStorage.getItem<string>(key(provider, scope))) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function saveModel(provider: ProviderId, scope: string, model: string): Promise<void> {
  await LocalStorage.setItem(key(provider, scope), model);
}

export async function clearModels(provider: ProviderId, scopes: string[]): Promise<void> {
  await Promise.all(scopes.map((scope) => LocalStorage.removeItem(key(provider, scope)).catch(() => undefined)));
}

export function resolveModel(opts: ResolveModelOptions): Promise<string> {
  return resolveModelWith((scope) => read(opts.provider, scope), opts);
}
