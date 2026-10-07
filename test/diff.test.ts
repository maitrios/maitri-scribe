import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { countChanges, renderDiff, renderPlain, wordCount } from "../src/lib/diff";

const removed = (text: string): string => `<s><span style="color:#e06c75">${text}</span></s>`;
const added = (text: string): string => `<span style="color:#98c379"><b>${text}</b></span>`;
const MARKERS = /<s>|<span|~~|\*\*/;

const ORIGINAL = "Their going to the store";
const CORRECTED = "They're going to the store";
const LINES_ORIGINAL = "first line\nsecond line here\nthird line";
const LINES_CORRECTED = "first line\nsecond lime here\nthird line";

describe("countChanges", () => {
  it("counts removed and added parts that contain visible characters", () => {
    assert.equal(countChanges(ORIGINAL, CORRECTED), 2);
    assert.equal(countChanges("a b c", "a x c y"), 3);
  });

  it("returns zero for identical texts", () => {
    assert.equal(countChanges(ORIGINAL, ORIGINAL), 0);
  });

  it("ignores whitespace-only changes", () => {
    assert.equal(countChanges("a  b", "a b"), 0);
    assert.equal(countChanges("one two three four", "one two\n\nthree four"), 0);
    assert.equal(countChanges("a\r\nb", "a\nb"), 0);
  });
});

describe("wordCount", () => {
  it("counts runs of non-whitespace characters", () => {
    assert.equal(wordCount(ORIGINAL), 5);
    assert.equal(wordCount("  a\n\tb  "), 2);
    assert.equal(wordCount("don't stop"), 2);
    assert.equal(wordCount(""), 0);
    assert.equal(wordCount("   "), 0);
  });
});

describe("renderDiff rich", () => {
  it("wraps removed and added words in colored spans", () => {
    const out = renderDiff(ORIGINAL, CORRECTED, "rich");
    assert.equal(out, `${removed("Their")} ${added("They're")} going to the store`);
    assert.ok(out.includes("<s><span style=\"color:#e06c75\">Their</span></s>"));
    assert.ok(out.includes("<span style=\"color:#98c379\"><b>They're</b></span>"));
    assert.ok(!out.includes("\\'"));
  });

  it("keeps a change on its own line with hard breaks around it", () => {
    const out = renderDiff(LINES_ORIGINAL, LINES_CORRECTED, "rich");
    assert.equal(out, `first line\\\nsecond ${removed("line")} ${added("lime")} here\\\nthird line`);
    const lines = out.split("\\\n");
    assert.equal(lines.length, 3);
    assert.equal(lines[0], "first line");
    assert.ok(lines[1].includes(removed("line")));
    assert.ok(lines[1].includes(added("lime")));
    assert.equal(lines[2], "third line");
  });

  it("keeps a paragraph split as a paragraph break", () => {
    const out = renderDiff("one two three four", "one two\n\nthree four", "rich");
    assert.equal(out, "one two \n\nthree four");
    assert.ok(!MARKERS.test(out));
  });

  it("renders whitespace-only changes as plain text", () => {
    const out = renderDiff("a  b", "a b", "rich");
    assert.equal(out, "a   b");
    assert.ok(!MARKERS.test(out));
    assert.ok(!MARKERS.test(renderDiff("a b ", "a b", "rich")));
    assert.ok(!MARKERS.test(renderDiff("a  b", "a b", "markdown")));
  });

  it("returns the plain rendering for identical texts", () => {
    const text = "line one\n\n    indented *two*";
    assert.equal(renderDiff(text, text, "rich"), renderPlain(text));
    assert.equal(renderDiff(text, text, "markdown"), renderPlain(text));
    assert.equal(renderDiff("a\r\nb", "a\nb", "rich"), renderPlain("a\nb"));
  });

  it("escapes markdown in unchanged text", () => {
    const original = "# not a heading\n*star* and _under_ <tag> & amp";
    const corrected = "# not a heading\n*star* and _under_ <tag> & amps";
    const prefix = "\\# not a heading\\\n\\*star\\* and \\_under\\_ \\<tag\\> \\& ";
    assert.equal(renderDiff(original, corrected, "rich"), `${prefix}${removed("amp")} ${added("amps")}`);
    assert.equal(renderDiff(original, corrected, "markdown"), `${prefix}~~amp~~ **amps**`);
  });

  it("escapes markdown inside changed segments without HTML entities", () => {
    const out = renderDiff("x", "<b>&</b>", "rich");
    assert.equal(out, `${removed("x")} ${added("\\<b\\>\\&\\</b\\>")}`);
    assert.ok(!out.includes("&amp;"));
    assert.ok(!out.includes("&lt;"));
  });

  it("keeps leading indentation as entities on a changed line", () => {
    const out = renderDiff("    code here", "    code there", "rich");
    assert.equal(out, `&nbsp;&nbsp;&nbsp;&nbsp;code ${removed("here")} ${added("there")}`);
  });

  it("keeps whitespace at the edge of a change outside the markers", () => {
    assert.equal(renderDiff("Keep this.", "Keep this. Add that.", "rich"), `Keep this\\. ${added("Add that\\.")}`);
    assert.equal(renderDiff("Keep this.", "Keep this. Add that.", "markdown"), "Keep this\\. **Add that\\.**");
  });
});

describe("renderDiff markdown", () => {
  it("uses strikethrough and bold with markers hugging the words", () => {
    assert.equal(renderDiff(ORIGINAL, CORRECTED, "markdown"), "~~Their~~ **They're** going to the store");
  });

  it("keeps the change on its line", () => {
    assert.equal(
      renderDiff(LINES_ORIGINAL, LINES_CORRECTED, "markdown"),
      "first line\\\nsecond ~~line~~ **lime** here\\\nthird line",
    );
  });
});

describe("renderDiff unified", () => {
  it("renders a fenced diff block with line prefixes", () => {
    const out = renderDiff("alpha\nbeta\ngamma", "alpha\nbeta changed\ngamma", "unified");
    assert.equal(out, "```diff\n  alpha\n- beta\n+ beta changed\n  gamma\n```");
  });

  it("does not add a phantom empty line for a trailing newline", () => {
    const out = renderDiff("alpha\nbeta\n", "alpha\nbeta changed\n", "unified");
    assert.equal(out, "```diff\n  alpha\n- beta\n+ beta changed\n```");
  });

  it("prefixes every line with two spaces for identical texts", () => {
    assert.equal(renderDiff("line one\nline two", "line one\nline two", "unified"), "```diff\n  line one\n  line two\n```");
  });

  it("does not escape anything inside the fence", () => {
    const out = renderDiff("# heading *x*", "# heading <b>&</b>", "unified");
    assert.equal(out, "```diff\n- # heading *x*\n+ # heading <b>&</b>\n```");
  });

  it("lengthens the fence when the text contains one", () => {
    assert.equal(renderDiff("a", "```\nb\n```", "unified"), "````diff\n- a\n+ ```\n+ b\n+ ```\n````");
  });
});

describe("renderPlain", () => {
  it("matches toMarkdownLines", () => {
    assert.equal(renderPlain("  a\nb\n\nc\n"), "&nbsp;&nbsp;a\\\nb\n\nc");
  });
});
