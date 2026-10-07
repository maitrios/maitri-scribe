import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { tmpdir } from "node:os";
import { supportsEffort } from "../lib/models";
import { clearResolvedBinCache } from "../lib/resolve-bin";
import { TransformError } from "../lib/types";
import type { Provider, TransformRequest, TransformResult } from "../lib/types";

export interface ClaudeCliOptions {
  bin: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fast?: boolean;
}

export interface ClaudeResultJson {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  usage?: { input_tokens?: number; output_tokens?: number };
  modelUsage?: Record<string, unknown>;
}

const KILL_GRACE_MS = 2000;
const MAX_MESSAGE_LENGTH = 300;
export const FAST_ENV: Record<string, string> = {
  MAX_THINKING_TOKENS: "0",
  DISABLE_TELEMETRY: "1",
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
};

const EMPTY_MCP_CONFIG = '{"mcpServers":{}}';

export function buildClaudeArgs(req: TransformRequest): string[] {
  const args = ["-p", req.instruction, "--model", req.model];
  if (req.fallbackModel && req.fallbackModel !== req.model) {
    args.push("--fallback-model", req.fallbackModel);
  }
  args.push(
    "--output-format",
    "json",
    "--no-session-persistence",
    "--max-turns",
    "1",
    "--tools",
    "",
    "--strict-mcp-config",
    "--mcp-config",
    EMPTY_MCP_CONFIG,
    "--system-prompt",
    req.system,
  );
  if (req.effort && supportsEffort(req.model)) {
    args.push("--effort", req.effort);
  }
  if (typeof req.maxCostUsd === "number" && Number.isFinite(req.maxCostUsd) && req.maxCostUsd > 0) {
    args.push("--max-budget-usd", formatUsd(req.maxCostUsd));
  }
  return args;
}

export function parseClaudeJson(stdout: string): ClaudeResultJson {
  const trimmed = stdout.trim();
  const whole = tryParseObject(trimmed);
  if (whole) return whole;

  const lines = trimmed.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const parsed = tryParseObject(lines[i].trim());
    if (parsed) return parsed;
  }
  throw new TransformError(
    `Unexpected output from the Claude CLI: ${trimmed === "" ? "(no output)" : trimmed.slice(0, 200)}`,
    "Run the same command in a terminal to see the raw output",
  );
}

export class ClaudeCliProvider implements Provider {
  readonly id = "claude-cli";

  constructor(private readonly opts: ClaudeCliOptions) {}

  transform(req: TransformRequest): Promise<TransformResult> {
    return new Promise<TransformResult>((resolve, reject) => {
      if (req.signal?.aborted) {
        reject(new TransformError("Cancelled"));
        return;
      }

      const bin = this.opts.bin;
      const env = { ...(this.opts.env ?? process.env), ...(this.opts.fast ? FAST_ENV : {}) };
      delete env.CLAUDECODE;
      delete env.CLAUDE_CODE_ENTRYPOINT;
      const startedAt = Date.now();

      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(bin, buildClaudeArgs(req), {
          cwd: this.opts.cwd ?? tmpdir(),
          env,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (err) {
        reject(startError(bin, err));
        return;
      }

      let stdout = "";
      let stderr = "";
      let settled = false;
      let timeoutTimer: NodeJS.Timeout | undefined;
      let killTimer: NodeJS.Timeout | undefined;

      const isAlive = () => child.exitCode === null && child.signalCode === null;
      const terminate = () => {
        if (!isAlive()) return;
        child.kill("SIGTERM");
        killTimer = setTimeout(() => {
          if (isAlive()) child.kill("SIGKILL");
        }, KILL_GRACE_MS);
        killTimer.unref();
      };
      const settle = (outcome: () => void) => {
        if (settled) return;
        settled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        req.signal?.removeEventListener("abort", onAbort);
        outcome();
      };
      const onAbort = () => {
        terminate();
        settle(() => reject(new TransformError("Cancelled")));
      };

      if (Number.isFinite(req.timeoutMs) && req.timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          terminate();
          settle(() =>
            reject(
              new TransformError(
                `Claude timed out after ${Math.round(req.timeoutMs / 1000)}s`,
                "Raise Timeout in the extension preferences or try a smaller selection",
                true,
                "timeout",
              ),
            ),
          );
        }, req.timeoutMs);
      }
      req.signal?.addEventListener("abort", onAbort, { once: true });

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.stdin.on("error", () => undefined);
      child.stdin.end(`<text>\n${req.text}\n</text>\n`);

      child.on("error", (err) => settle(() => reject(startError(bin, err))));
      child.on("close", (code, signal) => {
        if (killTimer) clearTimeout(killTimer);
        settle(() => {
          let json: ClaudeResultJson | undefined;
          let parseError: TransformError | undefined;
          try {
            json = parseClaudeJson(stdout);
          } catch (err) {
            parseError = err instanceof TransformError ? err : new TransformError(String(err));
          }

          const badSubtype = typeof json?.subtype === "string" && json.subtype !== "success";
          if (code !== 0 || json?.is_error === true || badSubtype) {
            const fallback = signal ? `killed by ${signal}` : `exit ${code}`;
            reject(classifyFailure(nonEmpty(json?.result) ?? nonEmpty(stderr) ?? fallback));
            return;
          }
          if (!json) {
            reject(parseError ?? new TransformError("Unexpected output from the Claude CLI"));
            return;
          }
          const text = String(json.result ?? "").trim();
          if (text === "") {
            reject(new TransformError("Claude returned an empty result", undefined, true));
            return;
          }
          resolve(toResult(json, text, req.model, Date.now() - startedAt));
        });
      });
    });
  }
}

function formatUsd(value: number): string {
  const fixed = value.toFixed(4).replace(/\.?0+$/, "");
  return fixed === "0" ? "0.0001" : fixed;
}

function tryParseObject(text: string): ClaudeResultJson | undefined {
  if (!text.startsWith("{")) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as ClaudeResultJson;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function classifyFailure(raw: string): TransformError {
  const message = raw.length > MAX_MESSAGE_LENGTH ? `${raw.slice(0, MAX_MESSAGE_LENGTH)}...` : raw;
  if (/not logged in|please run \/login|oauth|could not be refreshed|authenticat/i.test(message)) {
    return new TransformError(message, "Run `claude auth login` in a terminal, then try again", false, "auth");
  }
  if (/rate limit|429|overloaded|usage limit/i.test(message)) {
    return new TransformError(
      message,
      "Anthropic is rate limiting this account. Wait a minute or switch model",
      true,
    );
  }
  if (/budget/i.test(message)) {
    return new TransformError(message, "Raise Max Cost per Run in the extension preferences");
  }
  if (/max_turns|max turns/i.test(message)) {
    return new TransformError(
      message,
      "The model tried to use tools; this should not happen with tools disabled",
    );
  }
  return new TransformError(message);
}

function startError(bin: string, err: unknown): TransformError {
  clearResolvedBinCache();
  const reason = err instanceof Error ? err.message : String(err);
  return new TransformError(
    `Could not start ${bin}: ${reason}`,
    "Check Claude CLI Path in the extension preferences",
  );
}

function firstKey(record: Record<string, unknown> | undefined): string | undefined {
  if (!record) return undefined;
  return Object.keys(record)[0];
}

function toResult(json: ClaudeResultJson, text: string, requestedModel: string, wallMs: number): TransformResult {
  const result: TransformResult = {
    text,
    model: firstKey(json.modelUsage) ?? requestedModel,
    durationMs: typeof json.duration_ms === "number" ? json.duration_ms : wallMs,
  };
  if (typeof json.total_cost_usd === "number") result.costUsd = json.total_cost_usd;
  if (typeof json.usage?.input_tokens === "number") result.inputTokens = json.usage.input_tokens;
  if (typeof json.usage?.output_tokens === "number") result.outputTokens = json.usage.output_tokens;
  return result;
}
