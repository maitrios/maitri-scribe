import raycast from "../prompts/raycast.json";
import { buildSystemPrompt, INSTRUCTION } from "./prompts";
import type { PromptOptions } from "./prompts";
import type { CommandKind, PromptSpec, Seed } from "./types";

export interface RaycastPrompt {
  id: string;
  title: string;
  prompt: string;
  icon: string;
  creativity?: string;
  model?: string;
  date?: string;
  author?: { name: string; link?: string };
}

export interface RaycastCategory {
  name: string;
  slug: string;
  prompts: RaycastPrompt[];
}

interface RaycastFile {
  source: string;
  license: string;
  importedAt: string;
  categories: RaycastCategory[];
}

const data = raycast as RaycastFile;

const SELECTION_REF = "the text inside the <text> tags";
const SELECTION_BLOCK = /\n\n([A-Za-z][A-Za-z &()]{0,40}):\s*\{selection\}\s*\n\n([A-Za-z][A-Za-z &()]{0,40}):\s*$/;
const EDITABLE_SUFFIX = / - Editable$/;
const CREATIVITY = new Set(["none", "low", "medium", "high", "maximum"]);

const REWRITE_IDS = new Set([
  "improve-writing-custom",
  "fix-spelling-and-grammar-custom",
  "make-longer-custom",
  "make-shorter-custom",
  "change-tone-to-professional",
  "change-tone-to-friendly",
  "change-tone-to-confident-custom",
  "change-tone-to-casual-custom",
  "rephrase-as-tweet-custom",
  "act-as-a-character",
  "drunkgpt",
]);

const GENERATE_IDS = new Set(["decline-mail", "semantic-compressor", "write-docstring"]);

const REWRITE_PATTERN =
  /improve|fix|rewrite|rephrase|tone|shorter|longer|title case|break up|compress|translate|refactor|optimi[sz]e|debug statements|docstring|convert|natural language processing|css|tailwind|markdown|decline|bluf/i;

const PROMPT_PATCHES: Record<string, ReadonlyArray<readonly [string, string]>> = {
  "code-interpreter": [
    [
      "Act as a {argument name=language} interpreter. Execute the {argument name=language} code",
      "Act as an interpreter for the programming language of the code. Execute the code",
    ],
  ],
  "translate-to-language": [["Translate the text in {argument name=language}.", "Translate the text into English."]],
  "write-a-song": [["The mood of the song should be {argument name=mood}.", "The mood of the song should fit the text."]],
  "debate-controversial-topic": [
    ["Take a stance on the topic and {argument default=for} it.", "Take a stance for the topic and argue it."],
  ],
  "refactor-for-readability": [[" Explain the changes you made and why.", ""]],
  "optimize-performance": [["Provide the optimized version with explanations.", "Provide the optimized version."]],
};

const PAREN_MACROS: Record<string, string> = {
  "(replyWithRewrittenText)": "Reply only with the rewritten text.",
  "(maintainOriginalLanguage)": "Keep the original language of the text.",
  "(maintainURLs)": "Keep URLs in their original format without replacing them with markdown links.",
};

export const RAYCAST_ICON_TO_VICINAE: Record<string, string> = {
  "bar-chart": "BarChart",
  bird: "Bird",
  "blank-document": "BlankDocument",
  bolt: "Bolt",
  book: "Book",
  bug: "Bug",
  "bullet-points": "BulletPoints",
  calendar: "Calendar",
  check: "Check",
  "check-circle": "CheckCircle",
  "check-list": "CheckList",
  "circle-disabled": "CircleDisabled",
  code: "Code",
  emoji: "Emoji",
  envelope: "Envelope",
  flag: "Flag",
  folder: "Folder",
  "game-controller": "GameController",
  "globe-01": "Globe01",
  image: "Image",
  "light-bulb": "LightBulb",
  link: "Link",
  "magnifying-glass": "MagnifyingGlass",
  mobile: "Mobile",
  music: "Music",
  "new-document": "NewDocument",
  paragraph: "Paragraph",
  pencil: "Pencil",
  person: "Person",
  phone: "Phone",
  "play-filled": "PlayFilled",
  "plus-top-right-square": "PlusTopRightSquare",
  "question-mark-circle": "QuestionMarkCircle",
  "raycast-logo-neg": "Stars",
  shuffle: "Shuffle",
  snowflake: "Snowflake",
  "speech-bubble": "SpeechBubble",
  "speech-bubble-active": "SpeechBubbleActive",
  "speech-bubble-important": "SpeechBubbleImportant",
  swatch: "Swatch",
  tag: "Tag",
  text: "Text",
  "text-selection": "TextSelection",
  trash: "Trash",
  "x-mark-circle": "XMarkCircle",
};

let cache: Seed[] | undefined;

function isCreativity(value: string | undefined): value is NonNullable<Seed["creativity"]> {
  return value !== undefined && CREATIVITY.has(value);
}

function classify(prompt: Pick<RaycastPrompt, "id" | "title">): CommandKind {
  if (REWRITE_IDS.has(prompt.id)) return "rewrite";
  if (GENERATE_IDS.has(prompt.id)) return "generate";
  if (REWRITE_PATTERN.test(prompt.id) || REWRITE_PATTERN.test(prompt.title)) return "rewrite";
  return "generate";
}

function argumentValue(attrs: string): string {
  const parsed = new Map<string, string>();
  for (const match of attrs.matchAll(/(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g)) {
    parsed.set(match[1], match[2] ?? match[3] ?? match[4] ?? "");
  }
  return parsed.get("default") ?? SELECTION_REF;
}

function expandMacros(text: string): string {
  let out = text
    .replace(/\{argument\b([^{}]*)\}/g, (_match, attrs: string) => argumentValue(attrs))
    .replace(/\{(?:browser-tab|clipboard)\b[^{}]*\}/g, SELECTION_REF)
    .replace(/\{id=[^{}]*\}/g, "");
  for (const [macro, expansion] of Object.entries(PAREN_MACROS)) out = out.split(macro).join(expansion);
  return out;
}

export function buildSeed(category: string, prompt: RaycastPrompt): Seed {
  const seed: Seed = {
    id: prompt.id,
    title: prompt.title.replace(EDITABLE_SUFFIX, ""),
    category,
    prompt: prompt.prompt,
    kind: classify(prompt),
  };
  if (prompt.icon) seed.icon = prompt.icon;
  if (isCreativity(prompt.creativity)) seed.creativity = prompt.creativity;
  if (prompt.author) seed.author = prompt.author.link ? { name: prompt.author.name, link: prompt.author.link } : { name: prompt.author.name };
  if (prompt.date) seed.date = prompt.date;
  return seed;
}

export function loadSeeds(): Seed[] {
  if (!cache) {
    const seen = new Set<string>();
    cache = data.categories.flatMap((category) =>
      category.prompts
        .filter((prompt) => prompt.prompt.includes("{selection}"))
        .map((prompt) => {
          const seed = buildSeed(category.name, prompt);
          // Raycast reuses create-calendar-event in two categories; suffix the slug so ids stay unique
          if (seen.has(seed.id)) seed.id = `${seed.id}-${category.slug.replace(/^\//, "")}`;
          seen.add(seed.id);
          return seed;
        }),
    );
  }
  return cache;
}

export function seedCategories(): string[] {
  return [...new Set(loadSeeds().map((seed) => seed.category))];
}

export function convertSeedPrompt(seed: Pick<Seed, "id" | "prompt">): string {
  let text = seed.prompt;
  for (const [from, to] of PROMPT_PATCHES[seed.id] ?? []) text = text.split(from).join(to);
  let resultLabel: string | undefined;
  text = text.replace(SELECTION_BLOCK, (_match, _input: string, result: string) => {
    resultLabel = result.trim();
    return "";
  });
  text = expandMacros(text.replace(/\{selection\}/g, SELECTION_REF)).trim();
  if (resultLabel) text += `\n\nReply only with the ${resultLabel}.`;
  return text;
}

export function seedToPromptSpec(seed: Seed, opts: PromptOptions): PromptSpec {
  return {
    id: seed.id,
    title: seed.title.replace(EDITABLE_SUFFIX, ""),
    system: buildSystemPrompt(convertSeedPrompt(seed), opts, seed.kind),
    instruction: INSTRUCTION,
    kind: seed.kind,
  };
}

export function seedIcon(seed: Seed): string {
  return (seed.icon && RAYCAST_ICON_TO_VICINAE[seed.icon]) || "Text";
}

export function seedKeywords(seed: Seed): string[] {
  const words = `${seed.title} ${seed.category} ${seed.id}`
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1);
  return [...new Set(words)];
}

export function findSeed(id: string): Seed | undefined {
  return loadSeeds().find((seed) => seed.id === id);
}
