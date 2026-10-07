import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeOutput } from "../src/lib/sanitize";

describe("sanitizeOutput newlines", () => {
  it("normalizes Windows newlines", () => {
    assert.equal(sanitizeOutput("a\r\nb", "a\nb"), "a\nb");
  });

  it("adds back a single trailing newline the original had", () => {
    assert.equal(sanitizeOutput("Fixed.", "Broken.\n"), "Fixed.\n");
    assert.equal(sanitizeOutput("Fixed.\n\n\n", "Broken.\n"), "Fixed.\n");
    assert.equal(sanitizeOutput("Fixed.", "Broken.\r\n"), "Fixed.\n");
  });

  it("drops a trailing newline the original did not have", () => {
    assert.equal(sanitizeOutput("Fixed.\n", "Broken."), "Fixed.");
    assert.equal(sanitizeOutput("Fixed.", "Broken.\n\n"), "Fixed.");
  });
});

describe("sanitizeOutput text wrapper", () => {
  it("unwraps an echoed text wrapper", () => {
    assert.equal(sanitizeOutput("<text>\nFixed text.\n</text>", "Fixd text."), "Fixed text.");
    assert.equal(sanitizeOutput("Sure! Here you go:\n<text>Fixed.</text>\nLet me know.", "Fixd."), "Fixed.");
  });

  it("keeps text tags that the original also had", () => {
    const svg = "<svg><text>hi</text></svg>";
    assert.equal(sanitizeOutput(svg, svg), svg);
    assert.equal(sanitizeOutput("<text>\n<text>hi</text>\n</text>", "<text>hi</text>"), "<text>hi</text>");
  });
});

describe("sanitizeOutput trimming", () => {
  it("trims surrounding blank lines and whitespace", () => {
    assert.equal(sanitizeOutput("\n\n  Fixed.  \n\n", "Broken."), "Fixed.");
    assert.equal(sanitizeOutput("\tFixed.", "Broken."), "Fixed.");
  });

  it("keeps leading spaces when the original started with whitespace", () => {
    assert.equal(sanitizeOutput("\n  Fixed.\n", "  Broken."), "  Fixed.");
    assert.equal(sanitizeOutput("   \n  Fixed.", "\nBroken."), "  Fixed.");
  });

  it("keeps inner whitespace and punctuation as they are", () => {
    const text = "Fixed " + String.fromCharCode(0x2014) + " with a dash, \"quotes\" and  two spaces.";
    assert.equal(sanitizeOutput(text, "Broken."), text);
  });
});

describe("sanitizeOutput code fences", () => {
  it("unwraps a reply that is a single fenced block", () => {
    assert.equal(sanitizeOutput("```\nFixed.\n```", "Broken."), "Fixed.");
    assert.equal(sanitizeOutput("```text\nFixed.\n```", "Broken."), "Fixed.");
    assert.equal(sanitizeOutput("```\n\nline one\nline two\n\n```\n", "Broken."), "line one\nline two");
  });

  it("keeps the fence when the original started with one", () => {
    const code = "```js\nconst a = 1;\n```";
    assert.equal(sanitizeOutput(code, "```js\nconst a = 1\n```"), code);
  });

  it("keeps a reply made of several fenced blocks", () => {
    const reply = "```\na\n```\ntext\n```\nb\n```";
    assert.equal(sanitizeOutput(reply, "x"), reply);
  });

  it("keeps a fence that only opens the reply", () => {
    const reply = "```\ncode\n```\nand a closing remark";
    assert.equal(sanitizeOutput(reply, "x"), reply);
  });
});

describe("sanitizeOutput quotes", () => {
  it("strips one matching pair of wrapping quotes", () => {
    assert.equal(sanitizeOutput("\"Fixed.\"", "Broken."), "Fixed.");
    assert.equal(sanitizeOutput("“Fixed.”", "Broken."), "Fixed.");
    assert.equal(sanitizeOutput("'Fixed.'", "Broken."), "Fixed.");
    assert.equal(sanitizeOutput("\"He said 'hi'.\"", "Broken."), "He said 'hi'.");
  });

  it("keeps quotes when the original was quoted", () => {
    assert.equal(sanitizeOutput("\"Fixed.\"", "\"Broken.\""), "\"Fixed.\"");
    assert.equal(sanitizeOutput("“Fixed.”", "“Broken.”"), "“Fixed.”");
  });

  it("keeps quotes when the same quote character appears inside", () => {
    const speech = "\"Hi,\" she said. \"Bye.\"";
    assert.equal(sanitizeOutput(speech, "x"), speech);
    assert.equal(sanitizeOutput("'Don't.'", "x"), "'Don't.'");
    assert.equal(sanitizeOutput("“One” and “two”", "x"), "“One” and “two”");
  });

  it("keeps mismatched quotes", () => {
    assert.equal(sanitizeOutput("\"Fixed.'", "x"), "\"Fixed.'");
  });
});

describe("sanitizeOutput preambles", () => {
  it("drops a preamble line and the blank lines after it", () => {
    assert.equal(sanitizeOutput("Here is the corrected text:\n\nFixed.", "Broken."), "Fixed.");
    assert.equal(sanitizeOutput("Corrected text:\nFixed.", "Broken."), "Fixed.");
    assert.equal(sanitizeOutput("Fixed Text:\nFixed.", "Broken."), "Fixed.");
    assert.equal(sanitizeOutput("Improved Text:\n\n\nFixed.", "Broken."), "Fixed.");
    assert.equal(sanitizeOutput("Here's the text:  \nFixed.", "Broken."), "Fixed.");
    assert.equal(sanitizeOutput("here is your improved text:\nFixed.", "Broken."), "Fixed.");
  });

  it("keeps a first line that is not a preamble", () => {
    assert.equal(sanitizeOutput("Fixed.\nMore.", "Broken."), "Fixed.\nMore.");
    const comma = "Here is your text, corrected:\nFixed.";
    assert.equal(sanitizeOutput(comma, "Broken."), comma);
  });

  it("keeps a preamble-like line that the original also started with", () => {
    assert.equal(sanitizeOutput("Sample text:\nFixed.", "Sample text:\nBroken."), "Sample text:\nFixed.");
  });

  it("keeps a preamble-like line with nothing after it", () => {
    assert.equal(sanitizeOutput("Corrected text:", "Broken."), "Corrected text:");
  });

  it("unwraps a fence or quotes that follow a preamble", () => {
    assert.equal(sanitizeOutput("Here is the corrected text:\n```\nFixed.\n```", "Broken."), "Fixed.");
    assert.equal(sanitizeOutput("Corrected text:\n\n\"Fixed.\"", "Broken."), "Fixed.");
  });
});
