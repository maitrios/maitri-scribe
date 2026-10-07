import { tmpdir } from "node:os";
import { resolveClaudeBin } from "../lib/resolve-bin";
import { TransformError } from "../lib/types";
import type { Provider, ProviderChoice, ProviderId, TransformRequest, TransformResult } from "../lib/types";
import { AnthropicProvider } from "./anthropic";
import { ClaudeCliProvider } from "./claude-cli";
import { OpenAiProvider, trimBaseUrl } from "./openai";

export interface ProviderConfig {
  provider: ProviderChoice;
  claudePath?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  fast: boolean;
}

export interface ResolvedProvider {
  id: ProviderId;
  label: string;
  provider: Provider;
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  "claude-cli": "Claude CLI",
  anthropic: "Anthropic API",
  openai: "OpenAI API",
};

const NO_PROVIDER_HINT =
  "Install and log in to the Claude CLI, or add an Anthropic or OpenAI API key in the extension preferences";

function hasOpenAi(config: ProviderConfig): boolean {
  return Boolean(config.openaiApiKey) || trimBaseUrl(config.openaiBaseUrl) !== trimBaseUrl(undefined);
}

export async function resolveProviderId(config: ProviderConfig): Promise<ProviderId> {
  if (config.provider !== "auto") return config.provider;
  try {
    await resolveClaudeBin({ preferred: config.claudePath });
    return "claude-cli";
  } catch {
    if (config.anthropicApiKey) return "anthropic";
    if (hasOpenAi(config)) return "openai";
    throw new TransformError("No AI provider available", NO_PROVIDER_HINT);
  }
}

export class AuthFallbackProvider implements Provider {
  readonly id: string;

  constructor(
    private readonly primary: Provider,
    private readonly backup: Provider,
  ) {
    this.id = primary.id;
  }

  async transform(req: TransformRequest): Promise<TransformResult> {
    try {
      return await this.primary.transform(req);
    } catch (err) {
      if (err instanceof TransformError && err.kind === "auth") return this.backup.transform(req);
      throw err;
    }
  }
}

export async function createProvider(config: ProviderConfig): Promise<ResolvedProvider> {
  const id = await resolveProviderId(config);
  const provider = await build(id, config);
  const canFallBack = config.provider === "auto" && id === "claude-cli" && config.anthropicApiKey;
  return {
    id,
    label: PROVIDER_LABELS[id],
    provider: canFallBack
      ? new AuthFallbackProvider(provider, new AnthropicProvider({ apiKey: config.anthropicApiKey as string }))
      : provider,
  };
}

async function build(id: ProviderId, config: ProviderConfig): Promise<Provider> {
  if (id === "claude-cli") {
    const bin = await resolveClaudeBin({ preferred: config.claudePath });
    return new ClaudeCliProvider({ bin, cwd: tmpdir(), fast: config.fast });
  }
  if (id === "anthropic") {
    if (!config.anthropicApiKey) {
      throw new TransformError("No Anthropic API key", "Add one in the extension preferences");
    }
    return new AnthropicProvider({ apiKey: config.anthropicApiKey });
  }
  if (!hasOpenAi(config)) {
    throw new TransformError("No OpenAI API key", "Add one in the extension preferences");
  }
  return new OpenAiProvider({ apiKey: config.openaiApiKey, baseUrl: config.openaiBaseUrl });
}
