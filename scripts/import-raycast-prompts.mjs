#!/usr/bin/env node
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SOURCE_URL =
  "https://raw.githubusercontent.com/raycast/ray-so/main/app/(navigation)/prompts/prompts.ts";
const SOURCE_PAGE =
  "https://github.com/raycast/ray-so/blob/main/app/(navigation)/prompts/prompts.ts";
const LICENSE = "MIT, Copyright (c) 2024 Raycast Technologies Ltd";
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src", "prompts", "raycast.json");
const STUBS = [
  "type Model = string;",
  "type IconName = string;",
  "const Icons: Record<string, unknown> = new Proxy({}, { get: () => undefined });",
  "",
].join("\n");

async function readSource(arg) {
  if (!arg || /^https?:\/\//.test(arg)) {
    const url = arg ?? SOURCE_URL;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
    return res.text();
  }
  return readFile(resolve(arg), "utf8");
}

function stubImports(source) {
  const stripped = source.replace(/^import\s[\s\S]*?from\s+["'][^"']+["'];?[ \t]*\n/gm, "");
  if (stripped === source) throw new Error("no import statements found, this does not look like prompts.ts");
  return STUBS + stripped;
}

async function loadCategories(source) {
  if (!process.features.typescript) {
    throw new Error("this script needs Node with built-in type stripping (22.18+ or 23.6+)");
  }
  const dir = await mkdtemp(join(tmpdir(), "raycast-prompts-"));
  try {
    const file = join(dir, "prompts.mts");
    await writeFile(file, stubImports(source));
    const mod = await import(pathToFileURL(file).href);
    if (!Array.isArray(mod.baseCategories) || mod.baseCategories.length === 0) {
      throw new Error("prompts.ts did not export a non-empty baseCategories array");
    }
    return mod.baseCategories;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function toJson(categories) {
  return categories.map((category) => {
    if (typeof category.name !== "string" || typeof category.slug !== "string" || !Array.isArray(category.prompts)) {
      throw new Error(`malformed category: ${JSON.stringify(category)}`);
    }
    const prompts = category.prompts.map(({ iconComponent, ...prompt }) => {
      for (const key of ["id", "title", "prompt", "icon", "date"]) {
        if (typeof prompt[key] !== "string") {
          throw new Error(`prompt ${prompt.id ?? "<no id>"} in ${category.name} is missing string field "${key}"`);
        }
      }
      return prompt;
    });
    return { name: category.name, slug: category.slug, prompts };
  });
}

function report(categories) {
  let total = 0;
  let withSelection = 0;
  for (const category of categories) {
    const count = category.prompts.length;
    const selection = category.prompts.filter((p) => p.prompt.includes("{selection}")).length;
    total += count;
    withSelection += selection;
    console.error(
      `${category.name.padEnd(16)} ${String(count).padStart(3)} prompts, ${String(selection).padStart(3)} use {selection}`,
    );
  }
  console.error(`TOTAL ${total} prompts, ${withSelection} use {selection}`);
  const placeholders = new Set(
    categories.flatMap((c) => c.prompts.flatMap((p) => p.prompt.match(/\{(?:selection|argument|browser-tab|clipboard|id=)[^{}]*\}/g) ?? [])),
  );
  placeholders.delete("{selection}");
  console.error(`--- other placeholders: ${[...placeholders].join(" ") || "(none)"}`);
  if (total === 0) throw new Error("no prompts were extracted");
}

async function main() {
  const source = await readSource(process.argv[2]);
  const categories = toJson(await loadCategories(source));
  report(categories);
  const out = {
    source: SOURCE_PAGE,
    license: LICENSE,
    importedAt: new Date().toISOString().slice(0, 10),
    categories,
  };
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(out, null, 2)}\n`);
  console.error(`wrote ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
});
