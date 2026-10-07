import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { clearResolvedBinCache } from "../src/lib/resolve-bin";
import { TransformError } from "../src/lib/types";
import type { TransformRequest } from "../src/lib/types";
import { ClaudeCliProvider, buildClaudeArgs, parseClaudeJson } from "../src/providers/claude-cli";
import { createProvider } from "../src/providers/index";

const FIXTURE = join(__dirname, "fixtures", "fake-claude.mjs");
const scratch = mkdtempSync(join(tmpdir(), "ai-writer-cli-"));
let dumpCounter = 0;

after(() => rmSync(scratch, { recursive: true, force: true }));

interface Dump {
  argv: string[];
  stdin: string;
  cwd: string;
  pid: number;
  env: { CLAUDECODE: string | null };
}

function makeRequest(overrides: Partial<TransformRequest> = {}): TransformRequest {
  return {
    system: "You fix text.",
    instruction: "Fix it",
    text: "hello world",
    model: "haiku",
    timeoutMs: 5000,
    ...overrides,
  };
}

function makeProvider(mode: string, extraEnv: NodeJS.ProcessEnv = {}, cwd?: string) {
  const dump = join(scratch, `dump-${dumpCounter++}.json`);
  const provider = new ClaudeCliProvider({
    bin: FIXTURE,
    cwd,
    env: { ...process.env, FAKE_CLAUDE_MODE: mode, FAKE_CLAUDE_DUMP: dump, ...extraEnv },
  });
  return {
    provider,
    dumpExists: () => existsSync(dump),
    readDump: () => JSON.parse(readFileSync(dump, "utf8")) as Dump,
  };
}

function expectTransformError(check: (err: TransformError) => void): (err: unknown) => boolean {
  return (err: unknown) => {
    assert.ok(err instanceof TransformError, `expected TransformError, got ${String(err)}`);
    check(err);
    return true;
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(20);
  }
  return predicate();
}

const BASE_TAIL = [
  "--output-format",
  "json",
  "--no-session-persistence",
  "--max-turns",
  "1",
  "--tools",
  "",
  "--strict-mcp-config",
  "--mcp-config",
  '{"mcpServers":{}}',
  "--system-prompt",
  "You fix text.",
];

describe("buildClaudeArgs", () => {
  it("adds the fallback model and skips --effort for haiku", () => {
    const args = buildClaudeArgs(makeRequest({ model: "haiku", effort: "low", fallbackModel: "sonnet" }));
    assert.deepEqual(args, ["-p", "Fix it", "--model", "haiku", "--fallback-model", "sonnet", ...BASE_TAIL]);
  });

  it("skips the fallback when it equals the model and sends --effort for sonnet", () => {
    const args = buildClaudeArgs(makeRequest({ model: "sonnet", effort: "low", fallbackModel: "sonnet" }));
    assert.deepEqual(args, ["-p", "Fix it", "--model", "sonnet", ...BASE_TAIL, "--effort", "low"]);
  });

  it("formats --max-budget-usd with up to four decimals and no trailing zeros", () => {
    const budgetArgs = (maxCostUsd: number | undefined) =>
      buildClaudeArgs(makeRequest({ maxCostUsd })).slice(4 + BASE_TAIL.length);
    assert.deepEqual(budgetArgs(0.25), ["--max-budget-usd", "0.25"]);
    assert.deepEqual(budgetArgs(0.1 + 0.2), ["--max-budget-usd", "0.3"]);
    assert.deepEqual(budgetArgs(1), ["--max-budget-usd", "1"]);
    assert.deepEqual(budgetArgs(10), ["--max-budget-usd", "10"]);
    assert.deepEqual(budgetArgs(0.123456), ["--max-budget-usd", "0.1235"]);
    assert.deepEqual(budgetArgs(0), []);
    assert.deepEqual(budgetArgs(-1), []);
    assert.deepEqual(budgetArgs(Number.NaN), []);
    assert.deepEqual(budgetArgs(Number.POSITIVE_INFINITY), []);
    assert.deepEqual(budgetArgs(undefined), []);
  });
});

describe("parseClaudeJson", () => {
  it("parses a single JSON object", () => {
    assert.deepEqual(parseClaudeJson('  {"type":"result","result":"hi"}\n'), { type: "result", result: "hi" });
  });

  it("falls back to the last parseable line", () => {
    const stdout = [
      "warning: something on stderr leaked here",
      '{"type":"system","subtype":"init"}',
      '{"type":"result","subtype":"success","result":"b"}',
      "trailing noise",
    ].join("\n");
    assert.deepEqual(parseClaudeJson(stdout), { type: "result", subtype: "success", result: "b" });
  });

  it("throws a TransformError on garbage", () => {
    assert.throws(
      () => parseClaudeJson("not json at all"),
      expectTransformError((err) => {
        assert.equal(err.message, "Unexpected output from the Claude CLI: not json at all");
        assert.equal(err.hint, "Run the same command in a terminal to see the raw output");
      }),
    );
  });

  it("keeps only the first 200 chars of the raw output in the message", () => {
    assert.throws(
      () => parseClaudeJson("x".repeat(500)),
      expectTransformError((err) => {
        assert.equal(err.message, `Unexpected output from the Claude CLI: ${"x".repeat(200)}`);
      }),
    );
  });
});

describe("ClaudeCliProvider.transform", () => {
  it("returns the transformed text with usage and the model from modelUsage", async () => {
    const { provider, readDump } = makeProvider("ok", { CLAUDECODE: "1", CLAUDE_CODE_ENTRYPOINT: "cli" });
    const req = makeRequest({ effort: "low", fallbackModel: "sonnet", maxCostUsd: 0.25 });
    const result = await provider.transform(req);
    assert.deepEqual(result, {
      text: "HELLO WORLD",
      model: "claude-haiku-4-5",
      durationMs: 1834,
      costUsd: 0.0012,
      inputTokens: 10,
      outputTokens: 5,
    });

    const dump = readDump();
    assert.deepEqual(dump.argv, buildClaudeArgs(req));
    assert.equal(realpathSync(dump.cwd), realpathSync(tmpdir()));
    assert.equal(dump.stdin, "<text>\nhello world\n</text>\n");
    assert.equal(dump.env.CLAUDECODE, null);
  });

  it("honours a custom cwd and reports the model the CLI used", async () => {
    const { provider, readDump } = makeProvider("ok", {}, scratch);
    const result = await provider.transform(makeRequest({ model: "sonnet", text: "multi\nline" }));
    assert.equal(result.text, "MULTI\nLINE");
    assert.equal(result.model, "claude-sonnet-5");
    assert.equal(realpathSync(readDump().cwd), realpathSync(scratch));
  });

  it("maps an auth failure to a login hint", async () => {
    const { provider } = makeProvider("auth");
    await assert.rejects(
      provider.transform(makeRequest()),
      expectTransformError((err) => {
        assert.match(err.message, /Not logged in/);
        assert.match(err.hint ?? "", /claude auth login/);
        assert.equal(err.retryable, false);
      }),
    );
  });

  it("marks a rate limit as retryable", async () => {
    const { provider } = makeProvider("ratelimit");
    await assert.rejects(
      provider.transform(makeRequest()),
      expectTransformError((err) => {
        assert.match(err.message, /429/);
        assert.equal(err.retryable, true);
        assert.match(err.hint ?? "", /rate limiting/);
      }),
    );
  });

  it("rejects garbage output with a TransformError", async () => {
    const { provider } = makeProvider("garbage");
    await assert.rejects(
      provider.transform(makeRequest()),
      expectTransformError((err) => {
        assert.match(err.message, /^Unexpected output from the Claude CLI: not json at all/);
        assert.equal(err.retryable, false);
      }),
    );
  });

  it("treats an empty result as a retryable error", async () => {
    const { provider } = makeProvider("empty");
    await assert.rejects(
      provider.transform(makeRequest()),
      expectTransformError((err) => {
        assert.equal(err.message, "Claude returned an empty result");
        assert.equal(err.retryable, true);
      }),
    );
  });

  it("times out a hanging CLI and kills it", async () => {
    const { provider, dumpExists, readDump } = makeProvider("hang");
    const started = Date.now();
    await assert.rejects(
      provider.transform(makeRequest({ timeoutMs: 200 })),
      expectTransformError((err) => {
        assert.match(err.message, /timed out/);
        assert.equal(err.retryable, true);
        assert.match(err.hint ?? "", /Timeout/);
      }),
    );
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 1000, `timed out after ${elapsed}ms`);
    if (await waitFor(dumpExists, 1000)) {
      const { pid } = readDump();
      assert.ok(await waitFor(() => !isAlive(pid), 3000), `pid ${pid} is still alive`);
    }
  });

  it("rejects with Cancelled when the signal aborts", async () => {
    const { provider } = makeProvider("hang");
    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(
      provider.transform(makeRequest({ signal: controller.signal })),
      expectTransformError((err) => {
        assert.equal(err.message, "Cancelled");
        assert.equal(err.retryable, false);
      }),
    );
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 1000, `cancelled after ${elapsed}ms`);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const { provider, dumpExists } = makeProvider("ok");
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      provider.transform(makeRequest({ signal: controller.signal })),
      expectTransformError((err) => assert.equal(err.message, "Cancelled")),
    );
    await sleep(100);
    assert.equal(dumpExists(), false);
  });

  it("explains a binary that cannot be started", async () => {
    const bin = join(scratch, "missing-claude");
    const provider = new ClaudeCliProvider({ bin });
    await assert.rejects(
      provider.transform(makeRequest()),
      expectTransformError((err) => {
        assert.ok(err.message.startsWith(`Could not start ${bin}: `), err.message);
        assert.match(err.message, /ENOENT/);
        assert.match(err.hint ?? "", /Claude CLI Path/);
      }),
    );
  });
});

describe("createProvider", () => {
  it("resolves the configured binary and returns a claude-cli provider", async () => {
    clearResolvedBinCache();
    try {
      const provider = await createProvider({ claudePath: FIXTURE });
      assert.equal(provider.id, "claude-cli");
      const result = await provider.transform(makeRequest({ text: "abc" }));
      assert.equal(result.text, "ABC");
    } finally {
      clearResolvedBinCache();
    }
  });
});
