import { tmpdir } from "node:os";
import { resolveClaudeBin } from "../lib/resolve-bin";
import type { Provider } from "../lib/types";
import { ClaudeCliProvider } from "./claude-cli";

export async function createProvider(opts: { claudePath?: string | null } = {}): Promise<Provider> {
  const bin = await resolveClaudeBin({ preferred: opts.claudePath });
  return new ClaudeCliProvider({ bin, cwd: tmpdir() });
}
