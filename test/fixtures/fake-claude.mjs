#!/usr/bin/env node
import { writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const mode = process.env.FAKE_CLAUDE_MODE ?? "ok";

let stdin = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) stdin += chunk;

if (process.env.FAKE_CLAUDE_DUMP) {
  writeFileSync(
    process.env.FAKE_CLAUDE_DUMP,
    JSON.stringify({
      argv,
      stdin,
      cwd: process.cwd(),
      pid: process.pid,
      env: { CLAUDECODE: process.env.CLAUDECODE ?? null },
    }),
  );
}

const modelIndex = argv.indexOf("--model");
const model = modelIndex >= 0 ? (argv[modelIndex + 1] ?? "") : "";
const modelKey = model.includes("haiku") ? "claude-haiku-4-5" : "claude-sonnet-5";

function extractText(input) {
  const open = "<text>\n";
  const close = "\n</text>";
  const start = input.indexOf(open);
  const end = input.lastIndexOf(close);
  if (start < 0 || end < start) return input;
  return input.slice(start + open.length, end);
}

function success(result) {
  return {
    type: "result",
    subtype: "success",
    is_error: false,
    duration_ms: 1834,
    duration_api_ms: 1500,
    num_turns: 1,
    result,
    session_id: "fake-session",
    total_cost_usd: 0.0012,
    usage: { input_tokens: 10, output_tokens: 5 },
    modelUsage: { [modelKey]: { inputTokens: 10, outputTokens: 5, costUSD: 0.0012 } },
  };
}

function failure(result) {
  return {
    type: "result",
    subtype: "success",
    is_error: true,
    duration_ms: 12,
    duration_api_ms: 0,
    num_turns: 1,
    result,
    session_id: "fake-session",
    total_cost_usd: 0,
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

function emit(payload, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.exitCode = exitCode;
}

switch (mode) {
  case "auth":
    emit(failure("Not logged in · Please run /login"), 1);
    break;
  case "ratelimit":
    emit({ type: "result", subtype: "success", is_error: true, result: "Rate limit exceeded (429)" }, 1);
    break;
  case "garbage":
    process.stdout.write("not json at all\n");
    break;
  case "hang":
    setInterval(() => undefined, 1000);
    break;
  case "empty":
    emit(success(""));
    break;
  default:
    emit(success(extractText(stdin).toUpperCase()));
}
