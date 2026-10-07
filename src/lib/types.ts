export type Model = string;
export type ProviderId = "claude-cli" | "anthropic" | "openai";
export type ProviderChoice = "auto" | ProviderId;
export type Tier = "fast" | "quality";
export type Effort = "low" | "medium" | "high";
export type CommandKind = "rewrite" | "generate";
export type InputSource = "selection" | "clipboard";
export type DiffStyle = "rich" | "markdown" | "unified";

export interface TextInput {
  text: string;
  source: InputSource;
}

export interface PromptSpec {
  id: string;
  title: string;
  system: string;
  instruction: string;
  kind: CommandKind;
}

export interface TransformRequest {
  system: string;
  instruction: string;
  text: string;
  model: Model;
  fallbackModel?: Model;
  effort?: Effort;
  timeoutMs: number;
  maxCostUsd?: number;
  signal?: AbortSignal;
}

export interface TransformResult {
  text: string;
  model: string;
  durationMs: number;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface Provider {
  readonly id: string;
  transform(req: TransformRequest): Promise<TransformResult>;
}

export class TransformError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
    readonly retryable = false,
    readonly kind?: "auth" | "timeout",
  ) {
    super(message);
    this.name = "TransformError";
  }
}

export interface Seed {
  id: string;
  title: string;
  category: string;
  prompt: string;
  kind: CommandKind;
  icon?: string;
  creativity?: "none" | "low" | "medium" | "high" | "maximum";
  author?: { name: string; link?: string };
  date?: string;
}
