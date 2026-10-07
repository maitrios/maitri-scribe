import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOptions, cliOptions, compareVersionsDesc, listModels, recommend } from "../src/lib/catalog";
import { defaultModel, firstDefined, tierFor, toAnthropicId } from "../src/lib/models";
import { TransformError } from "../src/lib/types";
import type { TransformRequest } from "../src/lib/types";
import { AnthropicProvider } from "../src/providers/anthropic";
import { FAST_ENV } from "../src/providers/claude-cli";
import { AuthFallbackProvider, resolveProviderId, type ProviderConfig } from "../src/providers/index";
import { resolveModelWith } from "../src/lib/model-resolve";
import { OpenAiProvider } from "../src/providers/openai";

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(responses: { status?: number; body: unknown }[]): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  let index = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function req(overrides: Partial<TransformRequest> = {}): TransformRequest {
  return { system: "sys", instruction: "Fix it", text: "teh text", model: "haiku", timeoutMs: 5000, ...overrides };
}

const baseConfig: ProviderConfig = { provider: "auto", fast: true };

describe("model helpers", () => {
  it("maps aliases to Anthropic ids and leaves ids alone", () => {
    assert.equal(toAnthropicId("haiku"), "claude-haiku-4-5");
    assert.equal(toAnthropicId("claude-opus-4-1"), "claude-opus-4-1");
  });

  it("picks per-provider defaults by tier", () => {
    assert.equal(defaultModel("claude-cli", "fast"), "haiku");
    assert.equal(defaultModel("claude-cli", "quality"), "sonnet");
    assert.equal(defaultModel("anthropic", "fast"), "claude-haiku-4-5");
    assert.equal(defaultModel("openai", "fast"), "gpt-5-mini");
    assert.equal(tierFor("fix-grammar"), "fast");
    assert.equal(tierFor("improve-writing"), "quality");
  });

  it("firstDefined skips blanks", () => {
    assert.equal(firstDefined([undefined, "  ", "x", "y"], "z"), "x");
    assert.equal(firstDefined([null, ""], "z"), "z");
  });
});

describe("catalog", () => {
  it("compares versions newest first", () => {
    assert.ok(compareVersionsDesc("gpt-5.1", "gpt-5") < 0);
    assert.ok(compareVersionsDesc("claude-haiku-4-5", "claude-haiku-3-5") < 0);
  });

  it("recommends the newest haiku and sonnet for Anthropic", () => {
    const picks = recommend("anthropic", ["claude-sonnet-4-5", "claude-haiku-4-5", "claude-haiku-3-5", "claude-sonnet-5-5"]);
    assert.deepEqual(picks, { fast: "claude-haiku-4-5", quality: "claude-sonnet-5-5" });
  });

  it("recommends the newest mini and base gpt for OpenAI", () => {
    const picks = recommend("openai", ["gpt-4o", "gpt-5-mini", "gpt-5", "gpt-5.1", "gpt-5.1-mini", "gpt-5-nano"]);
    assert.deepEqual(picks, { fast: "gpt-5.1-mini", quality: "gpt-5.1" });
  });

  it("marks recommendations on the options", () => {
    const options = buildOptions("anthropic", ["claude-haiku-4-5", "claude-sonnet-5-5"]);
    assert.deepEqual(options.map((o) => o.recommendedFor), [["fast"], ["quality"]]);
  });

  it("offers the CLI aliases with recommendations", () => {
    const options = cliOptions();
    assert.deepEqual(options.map((o) => o.id), ["haiku", "sonnet", "opus", "fable"]);
    assert.deepEqual(options[0].recommendedFor, ["fast"]);
    assert.deepEqual(options[1].recommendedFor, ["quality"]);
  });

  it("lists Anthropic models with display names", async () => {
    const { fetchImpl, calls } = fakeFetch([
      { body: { data: [{ id: "claude-haiku-4-5", display_name: "Claude Haiku 4.5" }] } },
    ]);
    const options = await listModels("anthropic", { ...baseConfig, anthropicApiKey: "k" }, undefined, fetchImpl);
    assert.equal(options[0].label, "Claude Haiku 4.5");
    assert.deepEqual(options[0].recommendedFor, ["fast"]);
    assert.equal((calls[0].init.headers as Record<string, string>)["x-api-key"], "k");
  });

  it("lists OpenAI models, dropping non-chat ones and sorting newest first", async () => {
    const { fetchImpl } = fakeFetch([
      {
        body: {
          data: [
            { id: "text-embedding-3-small", created: 5 },
            { id: "gpt-5", created: 1 },
            { id: "gpt-5-mini", created: 3 },
          ],
        },
      },
    ]);
    const options = await listModels("openai", { ...baseConfig, openaiApiKey: "k" }, undefined, fetchImpl);
    assert.deepEqual(options.map((o) => o.id), ["gpt-5-mini", "gpt-5"]);
  });

  it("explains a missing Anthropic key", async () => {
    await assert.rejects(listModels("anthropic", baseConfig), TransformError);
  });
});

describe("AnthropicProvider", () => {
  it("posts to the messages endpoint and parses text and usage", async () => {
    const { fetchImpl, calls } = fakeFetch([
      { body: { model: "claude-haiku-4-5", content: [{ type: "text", text: " fixed " }], usage: { input_tokens: 4, output_tokens: 2 } } },
    ]);
    const result = await new AnthropicProvider({ apiKey: "k", fetchImpl }).transform(req());
    assert.equal(result.text, "fixed");
    assert.equal(result.inputTokens, 4);
    assert.equal(result.outputTokens, 2);
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.model, "claude-haiku-4-5");
    assert.equal(body.system, "sys");
    assert.match(body.messages[0].content, /<text>\nteh text\n<\/text>/);
    assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages");
  });

  it("falls back to the second model when the first is overloaded", async () => {
    const { fetchImpl, calls } = fakeFetch([
      { status: 529, body: { error: { message: "Overloaded" } } },
      { body: { content: [{ type: "text", text: "ok" }] } },
    ]);
    const result = await new AnthropicProvider({ apiKey: "k", fetchImpl }).transform(
      req({ model: "haiku", fallbackModel: "sonnet" }),
    );
    assert.equal(result.text, "ok");
    assert.equal(JSON.parse(String(calls[1].init.body)).model, "claude-sonnet-5-5");
  });

  it("surfaces a key hint on 401 without retrying", async () => {
    const { fetchImpl, calls } = fakeFetch([{ status: 401, body: { error: { message: "invalid x-api-key" } } }]);
    await assert.rejects(
      new AnthropicProvider({ apiKey: "bad", fetchImpl }).transform(req({ fallbackModel: "sonnet" })),
      (err: unknown) => err instanceof TransformError && /key/i.test(err.hint ?? "") && !err.retryable,
    );
    assert.equal(calls.length, 1);
  });
});

describe("OpenAiProvider", () => {
  it("posts chat completions with a bearer token and custom base url", async () => {
    const { fetchImpl, calls } = fakeFetch([
      { body: { model: "gpt-5-mini", choices: [{ message: { content: "done\n" } }], usage: { prompt_tokens: 3, completion_tokens: 1 } } },
    ]);
    const result = await new OpenAiProvider({ apiKey: "k", baseUrl: "http://localhost:11434/v1/", fetchImpl }).transform(
      req({ model: "gpt-5-mini" }),
    );
    assert.equal(result.text, "done");
    assert.equal(result.outputTokens, 1);
    assert.equal(calls[0].url, "http://localhost:11434/v1/chat/completions");
    assert.equal((calls[0].init.headers as Record<string, string>).authorization, "Bearer k");
    const body = JSON.parse(String(calls[0].init.body));
    assert.deepEqual(body.messages.map((m: { role: string }) => m.role), ["system", "user"]);
  });

  it("omits auth for keyless local servers and rejects empty replies", async () => {
    const { fetchImpl, calls } = fakeFetch([{ body: { choices: [{ message: { content: "" } }] } }]);
    await assert.rejects(new OpenAiProvider({ fetchImpl }).transform(req()), TransformError);
    assert.equal((calls[0].init.headers as Record<string, string>).authorization, undefined);
  });
});

describe("resolveProviderId", () => {
  it("honors an explicit provider", async () => {
    assert.equal(await resolveProviderId({ ...baseConfig, provider: "openai" }), "openai");
  });

  it("uses the CLI in auto mode when it is found", async () => {
    const fixture = new URL("./fixtures/fake-claude.mjs", `file://${__filename}`).pathname;
    assert.equal(await resolveProviderId({ ...baseConfig, claudePath: fixture }), "claude-cli");
  });
});

describe("fast mode", () => {
  it("turns off thinking and telemetry", () => {
    assert.equal(FAST_ENV.MAX_THINKING_TOKENS, "0");
    assert.equal(FAST_ENV.DISABLE_TELEMETRY, "1");
  });
});

describe("review fixes", () => {
  it("does not retry a timeout on the fallback model", async () => {
    let calls = 0;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      calls += 1;
      await new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
      return new Response("{}");
    }) as unknown as typeof fetch;
    await assert.rejects(
      new AnthropicProvider({ apiKey: "k", fetchImpl }).transform(req({ fallbackModel: "sonnet", timeoutMs: 20 })),
      (err: unknown) => err instanceof TransformError && err.kind === "timeout",
    );
    assert.equal(calls, 1);
  });

  it("marks 401 as an auth failure", async () => {
    const { fetchImpl } = fakeFetch([{ status: 401, body: { error: { message: "bad key" } } }]);
    await assert.rejects(
      new AnthropicProvider({ apiKey: "k", fetchImpl }).transform(req()),
      (err: unknown) => err instanceof TransformError && err.kind === "auth",
    );
  });

  const ok = { id: "x", transform: async () => ({ text: "backup", model: "m", durationMs: 1 }) };
  const authFail = { id: "claude-cli", transform: async () => { throw new TransformError("not logged in", "login", false, "auth"); } };
  const otherFail = { id: "claude-cli", transform: async () => { throw new TransformError("boom"); } };

  it("falls back to the backup only on auth failures", async () => {
    assert.equal((await new AuthFallbackProvider(authFail, ok).transform(req())).text, "backup");
    await assert.rejects(new AuthFallbackProvider(otherFail, ok).transform(req()), /boom/);
  });
});

describe("resolveModelWith", () => {
  const opts = { provider: "anthropic" as const, commandId: "fix-grammar", tier: "fast" as const };
  const reader = (store: Record<string, string>) => async (scope: string) => store[scope];

  it("prefers the command pick, then the global pick, then the preference, then the default", async () => {
    assert.equal(await resolveModelWith(reader({ "fix-grammar": "a", "*": "b" }), { ...opts, pref: "c" }), "a");
    assert.equal(await resolveModelWith(reader({ "*": "b" }), { ...opts, pref: "c" }), "b");
    assert.equal(await resolveModelWith(reader({}), { ...opts, pref: "Sonnet" }), "sonnet");
    assert.equal(await resolveModelWith(reader({}), opts), "claude-haiku-4-5");
  });

  it("returns empty when there is no default for the endpoint", async () => {
    assert.equal(await resolveModelWith(reader({}), { ...opts, provider: "openai", noDefault: true }), "");
  });
});
