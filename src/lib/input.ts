import { Clipboard, getSelectedText } from "@vicinae/api";
import type { TextInput } from "./types";

function stripTrailingNewline(text: string): string {
  if (text.endsWith("\r\n")) return text.slice(0, -2);
  if (text.endsWith("\n")) return text.slice(0, -1);
  return text;
}

async function readSelection(): Promise<string> {
  try {
    const text = await getSelectedText();
    return typeof text === "string" ? text : "";
  } catch {
    return "";
  }
}

async function readClipboard(): Promise<string> {
  try {
    const text = await Clipboard.readText();
    return typeof text === "string" ? text : "";
  } catch {
    return "";
  }
}

export async function readInput(): Promise<TextInput | null> {
  const selection = await readSelection();
  if (selection.trim() !== "") {
    return { text: stripTrailingNewline(selection), source: "selection" };
  }
  const clipboard = await readClipboard();
  if (clipboard.trim() !== "") {
    return { text: clipboard, source: "clipboard" };
  }
  return null;
}
