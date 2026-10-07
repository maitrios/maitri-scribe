import { defaultModel, firstDefined, normalizeModel } from "./models";
import type { ProviderId, Tier } from "./types";

export const ALL_COMMANDS = "*";

export interface ResolveModelOptions {
  provider: ProviderId;
  commandId: string;
  pref?: string;
  tier: Tier;
  noDefault?: boolean;
}

export type ReadPick = (scope: string) => Promise<string | undefined>;

export async function resolveModelWith(read: ReadPick, opts: ResolveModelOptions): Promise<string> {
  const [forCommand, forAll] = await Promise.all([read(opts.commandId), read(ALL_COMMANDS)]);
  const pref = opts.pref ? normalizeModel(opts.pref, "") : undefined;
  return firstDefined([forCommand, forAll, pref], opts.noDefault ? "" : defaultModel(opts.provider, opts.tier));
}
