import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MODEL_ALIASES, describeModel, normalizeModel, pickFallback, supportsEffort } from "../src/lib/models";

describe("MODEL_ALIASES", () => {
  it("lists the four aliases in order", () => {
    assert.deepEqual([...MODEL_ALIASES], ["haiku", "sonnet", "opus", "fable"]);
  });
});

describe("normalizeModel", () => {
  it("trims and lowercases aliases", () => {
    assert.equal(normalizeModel("  Haiku ", "sonnet"), "haiku");
    assert.equal(normalizeModel("SONNET", "haiku"), "sonnet");
    assert.equal(normalizeModel("Opus", "haiku"), "opus");
    assert.equal(normalizeModel("fable", "haiku"), "fable");
  });

  it("keeps full model ids as written apart from trimming", () => {
    assert.equal(normalizeModel(" claude-haiku-4-5-20251001 ", "sonnet"), "claude-haiku-4-5-20251001");
    assert.equal(normalizeModel("Claude-Opus-4-1", "sonnet"), "Claude-Opus-4-1");
  });

  it("applies the fallback when the input is empty", () => {
    assert.equal(normalizeModel("", "sonnet"), "sonnet");
    assert.equal(normalizeModel("   ", "sonnet"), "sonnet");
    assert.equal(normalizeModel(null, "haiku"), "haiku");
    assert.equal(normalizeModel(undefined, "opus"), "opus");
  });
});

describe("supportsEffort", () => {
  it("is false for haiku models", () => {
    assert.equal(supportsEffort("haiku"), false);
    assert.equal(supportsEffort("claude-haiku-4-5"), false);
    assert.equal(supportsEffort("Claude-Haiku-4-5-20251001"), false);
  });

  it("is true for everything else", () => {
    for (const model of ["sonnet", "opus", "fable", "claude-sonnet-4-5", "claude-opus-4-1"]) {
      assert.equal(supportsEffort(model), true, model);
    }
  });
});

describe("pickFallback", () => {
  it("uses the normalized preferred model when it differs from the primary", () => {
    assert.equal(pickFallback("haiku", " Sonnet "), "sonnet");
    assert.equal(pickFallback("sonnet", "opus"), "opus");
    assert.equal(pickFallback("sonnet", "claude-opus-4-1"), "claude-opus-4-1");
  });

  it("uses haiku when the preferred model equals the primary or is missing", () => {
    assert.equal(pickFallback("sonnet", "sonnet"), "haiku");
    assert.equal(pickFallback("sonnet", " SONNET "), "haiku");
    assert.equal(pickFallback("opus", undefined), "haiku");
    assert.equal(pickFallback("opus", null), "haiku");
    assert.equal(pickFallback("fable", ""), "haiku");
  });

  it("uses sonnet when the primary is a haiku model", () => {
    assert.equal(pickFallback("haiku", "haiku"), "sonnet");
    assert.equal(pickFallback("haiku", undefined), "sonnet");
    assert.equal(pickFallback("claude-haiku-4-5", undefined), "sonnet");
  });
});

describe("describeModel", () => {
  it("names aliases and ids that contain them", () => {
    assert.equal(describeModel("haiku"), "Haiku");
    assert.equal(describeModel("sonnet"), "Sonnet");
    assert.equal(describeModel("opus"), "Opus");
    assert.equal(describeModel("fable"), "Fable");
    assert.equal(describeModel("claude-haiku-4-5-20251001"), "Haiku");
    assert.equal(describeModel("claude-sonnet-4-5"), "Sonnet");
    assert.equal(describeModel("Claude-Opus-4-1"), "Opus");
  });

  it("returns unknown ids unchanged", () => {
    assert.equal(describeModel("gpt-5"), "gpt-5");
    assert.equal(describeModel(""), "");
  });
});
