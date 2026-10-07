import { diffLines, diffWordsWithSpace } from "diff";
import type { Change } from "diff";
import { escapeMarkdown, joinMarkdownLines, toMarkdownLines } from "./markdown";
import type { DiffStyle } from "./types";

type ChangeKind = "same" | "added" | "removed";

interface Piece {
  kind: ChangeKind;
  text: string;
}

type Wrap = (kind: ChangeKind, escaped: string) => string;

const REMOVED_COLOR = "#e06c75";
const ADDED_COLOR = "#98c379";

const wrapRich: Wrap = (kind, escaped) =>
  kind === "removed"
    ? `<s><span style="color:${REMOVED_COLOR}">${escaped}</span></s>`
    : `<span style="color:${ADDED_COLOR}"><b>${escaped}</b></span>`;

const wrapMarkdown: Wrap = (kind, escaped) => (kind === "removed" ? `~~${escaped}~~` : `**${escaped}**`);

function normalize(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function kindOf(change: Change): ChangeKind {
  if (change.added) return "added";
  if (change.removed) return "removed";
  return "same";
}

function wordChanges(original: string, corrected: string): Change[] {
  return diffWordsWithSpace(normalize(original), normalize(corrected));
}

function toLines(changes: Change[]): Piece[][] {
  const lines: Piece[][] = [[]];
  for (const change of changes) {
    const kind = kindOf(change);
    change.value.split("\n").forEach((segment, index) => {
      if (index > 0) lines.push([]);
      if (segment !== "") lines[lines.length - 1].push({ kind, text: segment });
    });
  }
  return lines;
}

function renderPiece(piece: Piece, wrap: Wrap): string {
  const core = piece.text.trim();
  if (piece.kind === "same" || core === "") return escapeMarkdown(piece.text);
  const start = piece.text.indexOf(core);
  return piece.text.slice(0, start) + wrap(piece.kind, escapeMarkdown(core)) + piece.text.slice(start + core.length);
}

function renderLine(pieces: Piece[], wrap: Wrap): string {
  let out = "";
  pieces.forEach((piece, index) => {
    const previous = index > 0 ? pieces[index - 1] : undefined;
    const glued = previous?.kind === "removed" && piece.kind === "added";
    if (glued && !/\s$/.test(previous.text) && !/^\s/.test(piece.text)) out += " ";
    out += renderPiece(piece, wrap);
  });
  return out;
}

function renderInline(original: string, corrected: string, wrap: Wrap): string {
  const lines = toLines(wordChanges(original, corrected));
  return joinMarkdownLines(lines.map((pieces) => renderLine(pieces, wrap)));
}

function fenceFor(body: string): string {
  // a longer fence keeps a code block inside the text from closing ours early
  const longest = Math.max(2, ...Array.from(body.matchAll(/`+/g), (match) => match[0].length));
  return "`".repeat(longest + 1);
}

function renderUnified(original: string, corrected: string): string {
  const lines: string[] = [];
  for (const change of diffLines(normalize(original), normalize(corrected))) {
    const prefix = change.added ? "+ " : change.removed ? "- " : "  ";
    const value = change.value.endsWith("\n") ? change.value.slice(0, -1) : change.value;
    for (const line of value.split("\n")) lines.push(prefix + line);
  }
  const body = lines.join("\n");
  const fence = fenceFor(body);
  return `${fence}diff\n${body}\n${fence}`;
}

export function renderDiff(original: string, corrected: string, style: DiffStyle): string {
  if (style === "unified") return renderUnified(original, corrected);
  if (normalize(original) === normalize(corrected)) return renderPlain(original);
  return renderInline(original, corrected, style === "markdown" ? wrapMarkdown : wrapRich);
}

export function renderPlain(text: string): string {
  return toMarkdownLines(text);
}

export function countChanges(original: string, corrected: string): number {
  return wordChanges(original, corrected).filter((change) => (change.added || change.removed) && /\S/.test(change.value))
    .length;
}

export function wordCount(text: string): number {
  return (text.match(/\S+/g) ?? []).length;
}
