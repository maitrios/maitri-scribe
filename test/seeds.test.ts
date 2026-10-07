import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { EM_DASH_RULE, GENERATE_RULES, INSTRUCTION, OUTPUT_RULES } from "../src/lib/prompts";
import {
  buildSeed,
  convertSeedPrompt,
  findSeed,
  loadSeeds,
  RAYCAST_ICON_TO_VICINAE,
  seedCategories,
  seedIcon,
  seedKeywords,
  seedToPromptSpec,
} from "../src/lib/seeds";
import type { RaycastCategory } from "../src/lib/seeds";
import type { Seed } from "../src/lib/types";
import raycast from "../src/prompts/raycast.json";

const EM_DASH = /\u2014/;
const SELECTION_REF = "the text inside the <text> tags";
const opts = { avoidEmDashes: true, styleRules: "Use British spelling" };

const categories: RaycastCategory[] = raycast.categories;
const allPrompts = categories.flatMap((category) =>
  category.prompts.map((prompt) => ({ ...prompt, category: category.name })),
);
const selectionPrompts = allPrompts.filter((prompt) => prompt.prompt.includes("{selection}"));
const seeds = loadSeeds();

function seed(id: string): Seed {
  const found = findSeed(id);
  assert.ok(found, `seed ${id} is missing`);
  return found;
}

function system(id: string): string {
  return seedToPromptSpec(seed(id), opts).system;
}

describe("raycast.json", () => {
  it("has the documented shape and provenance", () => {
    assert.match(raycast.source, /^https:\/\/github\.com\/raycast\/ray-so\//);
    assert.match(raycast.license, /^MIT/);
    assert.match(raycast.importedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(raycast.categories.length >= 5);
    assert.ok(allPrompts.length >= 80);
    for (const category of raycast.categories) {
      assert.equal(typeof category.name, "string");
      assert.match(category.slug, /^\/[a-z-]+$/);
      assert.ok(category.prompts.length > 0, `${category.name} has no prompts`);
    }
    for (const prompt of allPrompts) {
      for (const key of ["id", "title", "prompt", "icon", "date"] as const) {
        assert.equal(typeof prompt[key], "string", `${prompt.id} ${key}`);
      }
      assert.ok(!("iconComponent" in prompt), `${prompt.id} still has iconComponent`);
    }
  });
});

describe("loadSeeds", () => {
  it("keeps every prompt that uses {selection}, in category then source order", () => {
    assert.equal(seeds.length, selectionPrompts.length);
    assert.ok(seeds.length >= 60);
    assert.deepEqual(
      seeds.map((s) => [s.category, s.prompt]),
      selectionPrompts.map((p) => [p.category, p.prompt]),
    );
    assert.equal(loadSeeds(), seeds);
  });

  it("strips the Editable suffix from titles and copies the metadata over", () => {
    for (const s of seeds) assert.doesNotMatch(s.title, / - Editable$/);
    assert.equal(seed("improve-writing-custom").title, "Improve Writing");

    const source = allPrompts.find((p) => p.id === "write-tests");
    assert.ok(source?.author);
    const built = buildSeed("Code", source);
    assert.equal(built.category, "Code");
    assert.equal(built.icon, source.icon);
    assert.equal(built.creativity, source.creativity);
    assert.equal(built.date, source.date);
    assert.deepEqual(built.author, source.author);
    assert.equal(built.prompt, source.prompt);

    const odd = buildSeed("Misc", { id: "x", title: "Thing - Editable", prompt: "{selection}", icon: "text", creativity: "wild" });
    assert.equal(odd.title, "Thing");
    assert.equal(odd.creativity, undefined);
    assert.equal(odd.author, undefined);
    assert.equal(odd.date, undefined);
  });

  it("keeps ids unique even though Raycast reuses create-calendar-event", () => {
    const ids = seeds.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(seed("create-calendar-event").category, "Communication");
    assert.equal(seed("create-calendar-event-misc").category, "Misc");
  });
});

describe("seedToPromptSpec", () => {
  it("produces a clean spec for every seed", () => {
    for (const s of seeds) {
      const spec = seedToPromptSpec(s, opts);
      assert.equal(spec.id, s.id);
      assert.equal(spec.kind, s.kind);
      assert.equal(spec.instruction, INSTRUCTION);
      assert.doesNotMatch(spec.title, / - Editable$/);
      assert.ok(!spec.system.includes("{selection}"), s.id);
      assert.ok(spec.system.includes("<text>"), s.id);
      assert.ok(spec.system.includes("Output rules:"), s.id);
      assert.doesNotMatch(spec.system, /\{argument|\{id=|\{browser-tab|\{clipboard/, s.id);
      assert.doesNotMatch(spec.system, /\((?:replyWithRewrittenText|maintainOriginalLanguage|maintainURLs)\)/, s.id);
      assert.doesNotMatch(spec.system, EM_DASH, s.id);
      assert.equal(spec.system, spec.system.trimEnd(), s.id);
      assert.ok(spec.system.includes(EM_DASH_RULE), s.id);
      assert.ok(spec.system.endsWith("Additional rules from the user:\nUse British spelling"), s.id);
      if (s.kind === "rewrite") {
        assert.ok(spec.system.includes(OUTPUT_RULES) && !spec.system.includes(GENERATE_RULES), s.id);
      } else {
        assert.ok(spec.system.includes(GENERATE_RULES) && !spec.system.includes(OUTPUT_RULES), s.id);
      }
    }
  });

  it("turns the trailing selection block into a reply instruction", () => {
    const fixed = system("fix-spelling-and-grammar-custom");
    assert.ok(fixed.includes("\n\nReply only with the Fixed Text.\n\n"));
    assert.ok(!fixed.includes("Fixed Text:"));
    assert.ok(!fixed.includes("Text: "));

    assert.equal(
      convertSeedPrompt({ id: "x", prompt: "Do the thing.\n\nCode: {selection}\n\nOutput:" }),
      "Do the thing.\n\nReply only with the Output.",
    );
    assert.equal(
      convertSeedPrompt({ id: "x", prompt: "Intro.\n\nWall of text:\n{selection}\n\nCleaned up version:\n" }),
      "Intro.\n\nReply only with the Cleaned up version.",
    );
    const wall = convertSeedPrompt(seed("break-up-wall-of-text"));
    assert.ok(wall.endsWith("only the whitespace.\n\nReply only with the Cleaned up version."));
    assert.ok(!wall.includes("Wall of text:"));
    assert.equal(convertSeedPrompt(seed("pros-and-cons")).split("\n\n").pop(), "Reply only with the Pros & Cons.");
    assert.equal(convertSeedPrompt(seed("design-system-colors")).split("\n\n").pop(), "Reply only with the Color palette.");
  });

  it("rewrites inline selections and expands the Raycast macros", () => {
    assert.equal(convertSeedPrompt(seed("title-case")), `Convert ${SELECTION_REF} to title case.`);
    assert.ok(convertSeedPrompt(seed("find-synonyms")).startsWith(`Find synonyms for the word ${SELECTION_REF} `));
    assert.ok(system("act-as-a-character").includes("as if you were yoda. Use yoda's tone"));
    assert.ok(system("eli").includes("a 5 year old"));
    assert.ok(system("write-story").includes("more than 500 words"));
    assert.ok(system("create-analogies").startsWith("Develop 3 creative analogies"));
    assert.ok(system("semantic-compressor").includes(`Sentence = ${SELECTION_REF}\nPhrase focus = \n`));
    assert.ok(system("code-interpreter").startsWith("Act as an interpreter for the programming language of the code."));
    assert.ok(system("translate-to-language").startsWith("Translate the text into English."));
    assert.ok(system("write-a-song").includes("The mood of the song should fit the text."));
    assert.ok(system("weekly-update-to-weekly-note").includes("a new @raycast-notes."));
    assert.ok(system("fix-spelling-and-grammar-custom").includes("Act as a spelling corrector and improver. Reply only with the rewritten text."));
    assert.ok(system("fix-spelling-and-grammar-custom").includes("- Keep the original language of the text.\n"));
    assert.ok(system("fix-spelling-and-grammar-custom").includes("- Keep URLs in their original format without replacing them with markdown links.\n"));
    assert.ok(system("explain-code-custom").includes("{Icon.ArrowLeftCircle}"));
    assert.ok(!system("refactor-for-readability").includes("Explain the changes"));
    assert.ok(system("optimize-performance").includes("Provide the optimized version.\n"));
  });

  it("respects a prompt override", () => {
    const spec = seedToPromptSpec(seed("tldr"), { avoidEmDashes: false, override: "Summarize in one line." });
    assert.ok(spec.system.startsWith(`Summarize in one line.\n\n${GENERATE_RULES}`));
  });
});

describe("kind classification", () => {
  const rewrite = [
    "improve-writing-custom",
    "fix-spelling-and-grammar-custom",
    "make-shorter-custom",
    "make-longer-custom",
    "change-tone-to-casual-custom",
    "rephrase-as-tweet-custom",
    "break-up-wall-of-text",
    "title-case",
    "translate-to-language",
    "convert-html-to-markdown",
    "refactor-for-readability",
    "act-as-a-character",
  ];
  const generate = [
    "tldr",
    "explain-code-custom",
    "find-bugs-custom",
    "write-tests",
    "extract-links",
    "pros-and-cons",
    "create-analogies",
    "ask-question",
    "decline-mail",
    "write-docstring",
    "semantic-compressor",
    "create-recipe",
  ];

  it("pins rewrite seeds", () => {
    for (const id of rewrite) assert.equal(seed(id).kind, "rewrite", id);
  });

  it("pins generate seeds", () => {
    for (const id of generate) assert.equal(seed(id).kind, "generate", id);
  });
});

describe("seedIcon", () => {
  const iconDts = readFileSync(join(__dirname, "..", "node_modules", "@vicinae", "api", "dist", "api", "icon.d.ts"), "utf8");
  const enumKeys = new Set([...iconDts.matchAll(/^\s+([A-Za-z0-9_]+) = "[^"]*",?$/gm)].map((m) => m[1]));

  it("maps every Raycast icon in the JSON onto a key of the Icon enum", () => {
    assert.ok(enumKeys.size > 100);
    for (const [raycastIcon, key] of Object.entries(RAYCAST_ICON_TO_VICINAE)) {
      assert.ok(enumKeys.has(key), `${raycastIcon} -> ${key} is not an Icon enum key`);
    }
    for (const icon of new Set(allPrompts.map((p) => p.icon))) {
      assert.ok(icon in RAYCAST_ICON_TO_VICINAE, `no mapping for ${icon}`);
    }
    for (const s of seeds) assert.ok(enumKeys.has(seedIcon(s)), s.id);
  });

  it("maps known icons and falls back to Text", () => {
    assert.equal(seedIcon(seed("add-debug-statements")), "Bug");
    assert.equal(seedIcon(seed("write-story")), "Pencil");
    assert.equal(seedIcon({ ...seed("tldr"), icon: "no-such-icon" }), "Text");
    assert.equal(seedIcon({ ...seed("tldr"), icon: undefined }), "Text");
  });
});

describe("seedKeywords", () => {
  it("returns lowercase, deduped words from the title, category and id", () => {
    const words = seedKeywords(seed("improve-writing-custom"));
    for (const word of ["improve", "writing", "raycast", "prompts", "custom"]) assert.ok(words.includes(word), word);
    for (const s of seeds) {
      const keywords = seedKeywords(s);
      assert.ok(keywords.length > 0, s.id);
      assert.equal(new Set(keywords).size, keywords.length, s.id);
      for (const word of keywords) {
        assert.equal(word, word.toLowerCase());
        assert.match(word, /^[\p{L}\p{N}]{2,}$/u);
      }
    }
    assert.deepEqual(seedKeywords({ ...seed("tldr"), id: "text-text", title: "Text & Text", category: "Text" }), ["text"]);
  });
});

describe("findSeed and seedCategories", () => {
  it("finds seeds by id and misses gracefully", () => {
    assert.equal(findSeed("tldr")?.title, "TL;DR");
    assert.equal(findSeed("inspect-website"), undefined);
    assert.equal(findSeed("nope"), undefined);
  });

  it("lists the categories that have seeds, in JSON order", () => {
    assert.deepEqual(seedCategories(), [...new Set(selectionPrompts.map((p) => p.category))]);
    assert.ok(!seedCategories().includes("Browser"));
  });
});
