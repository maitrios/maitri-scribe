import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, escapeMarkdown, toMarkdownLines } from "../src/lib/markdown";

const SPECIALS = "\\`*_{}[]()#+-.!<>|~&";

describe("escapeMarkdown", () => {
  it("backslash-escapes every special character", () => {
    const expected = SPECIALS.split("")
      .map((ch) => `\\${ch}`)
      .join("");
    assert.equal(escapeMarkdown(SPECIALS), expected);
  });

  it("escapes each special character on its own", () => {
    for (const ch of SPECIALS) {
      assert.equal(escapeMarkdown(`a${ch}b`), `a\\${ch}b`, `character ${JSON.stringify(ch)}`);
    }
  });

  it("leaves newlines, quotes, commas, colons and non-ASCII alone", () => {
    const text = "Hello, world: it's \"fine\"; café \u{1F389} ¿qué? 100%\nnext line";
    assert.equal(escapeMarkdown(text), text);
  });

  it("escapes inline markdown in a sentence", () => {
    assert.equal(escapeMarkdown("Use *bold* and _it_."), "Use \\*bold\\* and \\_it\\_\\.");
  });
});

describe("escapeHtml", () => {
  it("escapes ampersand and angle brackets only", () => {
    assert.equal(escapeHtml("a < b && c > d"), "a &lt; b &amp;&amp; c &gt; d");
    assert.equal(escapeHtml("\"quoted\" 'single' *star*"), "\"quoted\" 'single' *star*");
  });
});

describe("toMarkdownLines", () => {
  it("joins a three-line paragraph with hard breaks", () => {
    assert.equal(toMarkdownLines("one\ntwo\nthree"), "one\\\ntwo\\\nthree");
  });

  it("turns a blank line into a paragraph break", () => {
    assert.equal(toMarkdownLines("one\ntwo\n\nthree"), "one\\\ntwo\n\nthree");
  });

  it("collapses several blank lines into one paragraph break", () => {
    assert.equal(toMarkdownLines("one\n\n\n\ntwo"), "one\n\ntwo");
  });

  it("treats a whitespace-only line as blank", () => {
    assert.equal(toMarkdownLines("one\n   \ntwo"), "one\n\ntwo");
  });

  it("turns leading spaces and tabs into non-breaking space entities", () => {
    assert.equal(
      toMarkdownLines("  two spaces\n\tone tab\n    four spaces"),
      "&nbsp;&nbsp;two spaces\\\n&nbsp;&nbsp;&nbsp;&nbsp;one tab\\\n&nbsp;&nbsp;&nbsp;&nbsp;four spaces",
    );
  });

  it("keeps inner whitespace as it is", () => {
    assert.equal(toMarkdownLines("a  b\tc"), "a  b\tc");
  });

  it("escapes markdown inside each line", () => {
    assert.equal(toMarkdownLines("- item\n# heading\n1. list"), "\\- item\\\n\\# heading\\\n1\\. list");
  });

  it("normalizes Windows newlines", () => {
    assert.equal(toMarkdownLines("a\r\nb\r\n\r\nc"), "a\\\nb\n\nc");
  });

  it("drops the trailing newline", () => {
    assert.equal(toMarkdownLines("a\nb\n"), "a\\\nb");
    assert.equal(toMarkdownLines("a\nb\n\n"), "a\\\nb");
  });

  it("returns an empty string for empty input", () => {
    assert.equal(toMarkdownLines(""), "");
    assert.equal(toMarkdownLines("\n\n"), "");
  });
});
