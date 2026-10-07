import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
  buildSystemPrompt,
  EM_DASH_RULE,
  FIX_GRAMMAR_PROMPT,
  GENERATE_RULES,
  getBuiltInPrompt,
  IMPROVE_WRITING_PROMPT,
  INSTRUCTION,
  loadPromptFile,
  OUTPUT_RULES,
} from "../src/lib/prompts";

const EM_DASH = /\u2014/;
const base = "You are a test editor.";
const STYLE_HEADING = "Additional rules from the user:";

describe("buildSystemPrompt", () => {
  it("joins the base and the output rules with a blank line", () => {
    assert.equal(buildSystemPrompt(base, { avoidEmDashes: false }), `${base}\n\n${OUTPUT_RULES}`);
  });

  it("toggles the em dash rule as an extra bullet of the rules block", () => {
    assert.equal(buildSystemPrompt(base, { avoidEmDashes: true }), `${base}\n\n${OUTPUT_RULES}\n${EM_DASH_RULE}`);
    assert.ok(!buildSystemPrompt(base, { avoidEmDashes: false }).includes(EM_DASH_RULE));
  });

  it("appends trimmed style rules as the final section", () => {
    const system = buildSystemPrompt(base, { avoidEmDashes: true, styleRules: "  Use British spelling\n\n" });
    assert.ok(system.endsWith(`${EM_DASH_RULE}\n\n${STYLE_HEADING}\nUse British spelling`));
    assert.ok(system.indexOf(base) < system.indexOf(OUTPUT_RULES));
    assert.ok(system.indexOf(OUTPUT_RULES) < system.indexOf(STYLE_HEADING));
  });

  it("omits the style section when the rules are blank or missing", () => {
    for (const styleRules of [undefined, null, "", "   \n\t"]) {
      assert.ok(!buildSystemPrompt(base, { avoidEmDashes: true, styleRules }).includes(STYLE_HEADING));
    }
  });

  it("lets a non-empty override replace the base and keeps the rules", () => {
    const system = buildSystemPrompt(base, { avoidEmDashes: true, override: "\n  Custom prompt.  \n" });
    assert.ok(system.startsWith(`Custom prompt.\n\n${OUTPUT_RULES}`));
    assert.ok(!system.includes(base));
    assert.ok(system.includes(EM_DASH_RULE));
  });

  it("ignores a blank override", () => {
    for (const override of [undefined, null, "", "  \n "]) {
      assert.ok(buildSystemPrompt(base, { avoidEmDashes: false, override }).startsWith(base));
    }
  });

  it("uses the lighter rules block for generate commands", () => {
    const system = buildSystemPrompt(base, { avoidEmDashes: true, styleRules: "Be brief" }, "generate");
    assert.equal(system, `${base}\n\n${GENERATE_RULES}\n${EM_DASH_RULE}\n\n${STYLE_HEADING}\nBe brief`);
    assert.ok(!system.includes(OUTPUT_RULES));
    assert.ok(buildSystemPrompt(base, { avoidEmDashes: false }, "rewrite").includes(OUTPUT_RULES));
  });

  it("never leaves trailing whitespace or em dash characters", () => {
    const systems = [
      buildSystemPrompt(`${base}\n\n`, { avoidEmDashes: true, styleRules: "x\n\n" }),
      buildSystemPrompt(base, { avoidEmDashes: false, override: "o\n" }, "generate"),
      buildSystemPrompt(FIX_GRAMMAR_PROMPT, { avoidEmDashes: true }),
      buildSystemPrompt(IMPROVE_WRITING_PROMPT, { avoidEmDashes: true }, "generate"),
    ];
    for (const system of systems) {
      assert.equal(system, system.trimEnd());
      assert.doesNotMatch(system, EM_DASH);
    }
    for (const text of [INSTRUCTION, OUTPUT_RULES, GENERATE_RULES, EM_DASH_RULE]) assert.doesNotMatch(text, EM_DASH);
  });
});

describe("getBuiltInPrompt", () => {
  const opts = { avoidEmDashes: true, styleRules: "Use British spelling" };

  it("builds the fix-grammar spec", () => {
    const spec = getBuiltInPrompt("fix-grammar", opts);
    assert.equal(spec.id, "fix-grammar");
    assert.equal(spec.title, "Fix Spelling and Grammar");
    assert.equal(spec.kind, "rewrite");
    assert.equal(spec.instruction, INSTRUCTION);
    assert.equal(spec.system, buildSystemPrompt(FIX_GRAMMAR_PROMPT, opts));
    assert.ok(spec.system.startsWith("You are a meticulous copy editor."));
  });

  it("builds the improve-writing spec", () => {
    const spec = getBuiltInPrompt("improve-writing", opts);
    assert.equal(spec.id, "improve-writing");
    assert.equal(spec.title, "Improve Writing");
    assert.equal(spec.kind, "rewrite");
    assert.equal(spec.instruction, INSTRUCTION);
    assert.equal(spec.system, buildSystemPrompt(IMPROVE_WRITING_PROMPT, opts));
    assert.ok(spec.system.startsWith("You are an experienced editor."));
  });

  it("honours a prompt override", () => {
    const spec = getBuiltInPrompt("fix-grammar", { avoidEmDashes: false, override: "Only fix typos." });
    assert.ok(spec.system.startsWith("Only fix typos.\n\n"));
    assert.ok(!spec.system.includes("meticulous copy editor"));
    assert.doesNotMatch(spec.system, EM_DASH);
  });
});

describe("loadPromptFile", () => {
  const dir = mkdtempSync(join(tmpdir(), "scribe-prompts-"));
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("returns the trimmed contents of a readable file", () => {
    const file = join(dir, "prompt.txt");
    writeFileSync(file, "\n  Be terse.\nNo fluff.  \n\n");
    assert.equal(loadPromptFile(file), "Be terse.\nNo fluff.");
    assert.equal(loadPromptFile(`  ${file}  `), "Be terse.\nNo fluff.");
  });

  it("returns undefined for a blank file", () => {
    const file = join(dir, "blank.txt");
    writeFileSync(file, " \n\t\n");
    assert.equal(loadPromptFile(file), undefined);
  });

  it("returns undefined for a missing path or a directory", () => {
    assert.equal(loadPromptFile(join(dir, "missing.txt")), undefined);
    assert.equal(loadPromptFile(dir), undefined);
  });

  it("returns undefined for empty input", () => {
    for (const path of [undefined, null, "", "   "]) assert.equal(loadPromptFile(path), undefined);
  });
});
