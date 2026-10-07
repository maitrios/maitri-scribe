const PREAMBLE = /^(?:here(?:'s| is) (?:the )?)?[a-z ]{0,40}text:\s*$/i;
const FENCED_BLOCK = /^```[^\n]*\n([\s\S]*)\n```$/;
const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["\"", "\""],
  ["“", "”"],
  ["'", "'"],
];

function normalize(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function dropLeadingBlankLines(text: string): string {
  return text.replace(/^(?:[ \t]*\n)+/, "");
}

function unwrapTextTag(text: string, original: string): string {
  const open = text.indexOf("<text>");
  const close = text.lastIndexOf("</text>");
  // echoed framing adds a <text> pair the original never had; an equal count means the tags are content
  if (open === -1 || close < open || count(text, "<text>") <= count(original, "<text>")) return text;
  return text.slice(open + "<text>".length, close);
}

function stripPreamble(text: string, original: string): string {
  const lines = dropLeadingBlankLines(text).split("\n");
  const originalFirst = dropLeadingBlankLines(original).split("\n")[0].trim();
  if (lines.length < 2 || !PREAMBLE.test(lines[0].trim()) || PREAMBLE.test(originalFirst)) return text;
  let next = 1;
  while (next < lines.length && lines[next].trim() === "") next += 1;
  return lines.slice(next).join("\n");
}

function trimEdges(text: string, original: string): string {
  const trimmed = dropLeadingBlankLines(text.replace(/\s+$/, ""));
  return /^\s/.test(original) ? trimmed : trimmed.replace(/^\s+/, "");
}

function unwrapFence(text: string, original: string): string {
  if (original.trimStart().startsWith("```")) return text;
  const match = FENCED_BLOCK.exec(text);
  if (!match || /^```/m.test(match[1])) return text;
  return match[1];
}

function isQuoted(text: string): boolean {
  return QUOTE_PAIRS.some(([open, close]) => text.length >= 2 && text.startsWith(open) && text.endsWith(close));
}

function unwrapQuotes(text: string, original: string): string {
  if (isQuoted(original.trim())) return text;
  for (const [open, close] of QUOTE_PAIRS) {
    if (text.length < 2 || !text.startsWith(open) || !text.endsWith(close)) continue;
    const inner = text.slice(open.length, -close.length);
    return inner.includes(open) || inner.includes(close) ? text : inner;
  }
  return text;
}

function restoreTrailingNewline(text: string, original: string): string {
  if (text === "" || !original.endsWith("\n") || original.endsWith("\n\n")) return text;
  return `${text}\n`;
}

export function sanitizeOutput(raw: string, original: string): string {
  const source = normalize(original);
  let text = unwrapTextTag(normalize(raw), source);
  text = stripPreamble(text, source);
  text = trimEdges(text, source);
  text = trimEdges(unwrapFence(text, source), source);
  text = trimEdges(unwrapQuotes(text, source), source);
  return restoreTrailingNewline(text, source);
}
