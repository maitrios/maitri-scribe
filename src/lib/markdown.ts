const MARKDOWN_SPECIALS = /[\\`*_{}[\]()#+\-.!<>|~&]/g;

export function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_SPECIALS, "\\$&");
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function splitLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

export function indentToEntities(line: string): string {
  return line.replace(/^[ \t]+/, (indent) => indent.replace(/\t/g, "    ").replace(/ /g, "&nbsp;"));
}

export function joinMarkdownLines(lines: string[]): string {
  const chunks: string[] = [];
  let paragraphBreak = false;
  for (const line of lines) {
    if (line.trim() === "") {
      paragraphBreak = true;
      continue;
    }
    if (chunks.length > 0) chunks.push(paragraphBreak ? "\n\n" : "\\\n");
    chunks.push(indentToEntities(line));
    paragraphBreak = false;
  }
  return chunks.join("");
}

export function toMarkdownLines(text: string): string {
  return joinMarkdownLines(splitLines(text).map(escapeMarkdown));
}
