import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { TransformError } from "./types";

export interface ResolveOptions {
  preferred?: string | null;
  env?: NodeJS.ProcessEnv;
  home?: string;
  shell?: string;
  useCache?: boolean;
}

const LOGIN_SHELL_TIMEOUT_MS = 5000;

let cache: { key: string; bin: string } | undefined;

export function clearResolvedBinCache(): void {
  cache = undefined;
}

export async function resolveClaudeBin(opts: ResolveOptions = {}): Promise<string> {
  const preferred = (opts.preferred ?? "").trim();
  const useCache = opts.useCache ?? true;
  if (useCache && cache && cache.key === preferred) return cache.bin;

  let bin: string | undefined;
  try {
    bin = await findClaudeBin(preferred, opts);
  } catch (err) {
    throw toTransformError(err);
  }
  if (!bin) {
    throw new TransformError(
      "Claude CLI not found",
      "Install Claude Code or set Claude CLI Path in the extension preferences",
    );
  }
  cache = { key: preferred, bin };
  return bin;
}

async function findClaudeBin(preferred: string, opts: ResolveOptions): Promise<string | undefined> {
  const env = opts.env ?? process.env;
  const home = opts.home ?? env.HOME ?? homedir();

  const candidates: string[] = [];
  if (preferred !== "") candidates.push(expandHome(preferred, home));
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (dir !== "") candidates.push(resolve(dir, "claude"));
  }
  candidates.push(
    join(home, ".local", "bin", "claude"),
    join(home, ".claude", "local", "claude"),
    join(home, ".local", "share", "mise", "installs", "claude", "latest", "claude"),
    join(home, ".local", "share", "mise", "shims", "claude"),
    "/usr/local/bin/claude",
    "/usr/bin/claude",
  );
  for (const candidate of candidates) {
    if (await isExecutableFile(candidate)) return candidate;
  }

  const fromShell = await queryLoginShell(opts.shell ?? env.SHELL ?? "/bin/bash", env);
  if (fromShell !== undefined && (await isExecutableFile(fromShell))) return fromShell;
  return undefined;
}

function expandHome(input: string, home: string): string {
  if (input === "~") return home;
  if (input.startsWith("~/")) return join(home, input.slice(2));
  return input;
}

async function isExecutableFile(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function spawnLoginShell(shell: string, env: NodeJS.ProcessEnv): ChildProcess | undefined {
  try {
    return spawn(shell, ["-lc", "command -v claude"], { env, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return undefined;
  }
}

function queryLoginShell(shell: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  return new Promise((done) => {
    const child = spawnLoginShell(shell, env);
    if (!child) {
      done(undefined);
      return;
    }

    let stdout = "";
    let finished = false;
    const finish = (value: string | undefined) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      done(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(undefined);
    }, LOGIN_SHELL_TIMEOUT_MS);

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.on("error", () => finish(undefined));
    child.on("close", () => finish(firstLine(stdout)));
  });
}

function firstLine(output: string): string | undefined {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== "");
}

function toTransformError(err: unknown): TransformError {
  if (err instanceof TransformError) return err;
  const reason = err instanceof Error ? err.message : String(err);
  return new TransformError(
    `Could not look for the Claude CLI: ${reason}`,
    "Set Claude CLI Path in the extension preferences",
  );
}
