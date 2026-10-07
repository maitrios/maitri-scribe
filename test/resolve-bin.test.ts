import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { clearResolvedBinCache, resolveClaudeBin } from "../src/lib/resolve-bin";
import { TransformError } from "../src/lib/types";

const root = mkdtempSync(join(tmpdir(), "ai-writer-resolve-"));
const emptyDir = join(root, "empty");
const emptyHome = join(root, "empty-home");
mkdirSync(emptyDir);
mkdirSync(emptyHome);

function makeExecutable(path: string, body = "#!/bin/sh\nexit 0\n"): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  chmodSync(path, 0o755);
  return path;
}

const silentShell = makeExecutable(join(root, "shells", "silent"), "#!/bin/sh\nexit 1\n");

function baseOptions() {
  return { env: { PATH: emptyDir }, home: emptyHome, shell: silentShell };
}

function expectNotFound(err: unknown): boolean {
  assert.ok(err instanceof TransformError);
  assert.equal(err.message, "Claude CLI not found");
  assert.equal(err.hint, "Install Claude Code or set Claude CLI Path in the extension preferences");
  assert.equal(err.retryable, false);
  return true;
}

after(() => rmSync(root, { recursive: true, force: true }));
beforeEach(() => clearResolvedBinCache());

describe("resolveClaudeBin", () => {
  it("finds an executable claude on PATH", async () => {
    const bin = makeExecutable(join(root, "path-bin", "claude"));
    const found = await resolveClaudeBin({ ...baseOptions(), env: { PATH: `${emptyDir}:${dirname(bin)}` } });
    assert.equal(found, bin);
  });

  it("prefers the configured path over PATH", async () => {
    const onPath = makeExecutable(join(root, "path-bin2", "claude"));
    const preferred = makeExecutable(join(root, "custom", "my-claude"));
    const found = await resolveClaudeBin({
      ...baseOptions(),
      preferred: ` ${preferred} `,
      env: { PATH: dirname(onPath) },
    });
    assert.equal(found, preferred);
  });

  it("expands ~ in the configured path", async () => {
    const home = join(root, "home-tilde");
    const bin = makeExecutable(join(home, "bin", "claude"));
    const found = await resolveClaudeBin({ ...baseOptions(), preferred: "~/bin/claude", home });
    assert.equal(found, bin);
  });

  it("falls through when the configured path is missing or not a file", async () => {
    const onPath = makeExecutable(join(root, "path-bin3", "claude"));
    const env = { PATH: dirname(onPath) };
    const missing = await resolveClaudeBin({ ...baseOptions(), preferred: join(root, "nope", "claude"), env });
    assert.equal(missing, onPath);
    const directory = await resolveClaudeBin({ ...baseOptions(), preferred: dirname(onPath), env, useCache: false });
    assert.equal(directory, onPath);
  });

  it("skips PATH entries that are not executable", async () => {
    const noExecDir = join(root, "path-noexec");
    mkdirSync(noExecDir);
    writeFileSync(join(noExecDir, "claude"), "#!/bin/sh\n");
    chmodSync(join(noExecDir, "claude"), 0o644);
    const real = makeExecutable(join(root, "path-bin4", "claude"));
    const found = await resolveClaudeBin({ ...baseOptions(), env: { PATH: `${noExecDir}:${dirname(real)}` } });
    assert.equal(found, real);
  });

  it("checks the known install locations under home", async () => {
    const home = join(root, "home-known");
    const bin = makeExecutable(join(home, ".claude", "local", "claude"));
    const found = await resolveClaudeBin({ ...baseOptions(), home });
    assert.equal(found, bin);
  });

  it("asks the login shell as a last resort", async () => {
    const bin = makeExecutable(join(root, "shell-found", "claude"));
    const shell = makeExecutable(join(root, "shells", "finder"), `#!/bin/sh\necho "${bin}"\n`);
    const found = await resolveClaudeBin({ ...baseOptions(), shell });
    assert.equal(found, bin);
  });

  it("ignores login shell output that is not an executable file", async () => {
    const shell = makeExecutable(join(root, "shells", "alias"), "#!/bin/sh\necho \"alias claude='/nope/claude'\"\n");
    await assert.rejects(resolveClaudeBin({ ...baseOptions(), shell }), expectNotFound);
  });

  it("throws a TransformError with a hint when nothing is found", async () => {
    await assert.rejects(resolveClaudeBin(baseOptions()), expectNotFound);
  });

  it("survives a missing login shell", async () => {
    await assert.rejects(resolveClaudeBin({ ...baseOptions(), shell: join(root, "no-such-shell") }), expectNotFound);
  });

  it("caches the result until the cache is cleared", async () => {
    const bin = makeExecutable(join(root, "path-cache", "claude"));
    const opts = { ...baseOptions(), env: { PATH: dirname(bin) } };
    assert.equal(await resolveClaudeBin(opts), bin);
    unlinkSync(bin);
    assert.equal(await resolveClaudeBin(opts), bin);
    await assert.rejects(resolveClaudeBin({ ...opts, useCache: false }), expectNotFound);
    clearResolvedBinCache();
    await assert.rejects(resolveClaudeBin(opts), expectNotFound);
  });

  it("does not reuse a cached result for a different configured path", async () => {
    const first = makeExecutable(join(root, "keyed", "first"));
    const second = makeExecutable(join(root, "keyed", "second"));
    assert.equal(await resolveClaudeBin({ ...baseOptions(), preferred: first }), first);
    assert.equal(await resolveClaudeBin({ ...baseOptions(), preferred: second }), second);
    assert.equal(await resolveClaudeBin({ ...baseOptions(), preferred: first }), first);
  });
});
