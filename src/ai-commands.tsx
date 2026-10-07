import {
  Action,
  ActionPanel,
  Clipboard,
  Color,
  getPreferenceValues,
  Icon,
  List,
  LocalStorage,
  openCommandPreferences,
  openExtensionPreferences,
  showToast,
  Toast,
  useNavigation,
  type ImageLike,
  type LaunchProps,
} from "@vicinae/api";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { ResultView } from "./components/ResultView";
import { promptOptions, readCommonPrefs, readModelPref, type CommonPrefs } from "./lib/preferences";
import { getBuiltInPrompt } from "./lib/prompts";
import { loadSeeds, seedCategories, seedIcon, seedKeywords, seedToPromptSpec } from "./lib/seeds";
import type { CommandKind, PromptSpec } from "./lib/types";

const RECENT_KEY = "scribe.recent";
const RECENT_LIMIT = 5;
const BUILT_IN_SECTION = "Built-in";

interface Entry {
  id: string;
  title: string;
  category: string;
  kind: CommandKind;
  icon: ImageLike;
  keywords: string[];
  build: () => PromptSpec;
}

interface Section {
  title: string;
  entries: Entry[];
}

interface Catalog {
  byId: Map<string, Entry>;
  sections: Section[];
}

function iconFor(name: string): ImageLike {
  return Icon[name as keyof typeof Icon] ?? Icon.Text;
}

function buildCatalog(prefs: CommonPrefs): Catalog {
  const opts = promptOptions(prefs);
  const byId = new Map<string, Entry>();
  const builtIn: Entry[] = [];
  const builtInSpecs = [
    {
      spec: getBuiltInPrompt("fix-grammar", opts),
      icon: Icon.Pencil,
      keywords: ["proofread", "spelling", "grammar", "typo", "correct"],
    },
    {
      spec: getBuiltInPrompt("improve-writing", opts),
      icon: Icon.Wand,
      keywords: ["rewrite", "clarity", "edit", "polish"],
    },
  ];
  for (const { spec, icon, keywords } of builtInSpecs) {
    const entry: Entry = {
      id: spec.id,
      title: spec.title,
      category: BUILT_IN_SECTION,
      kind: spec.kind,
      icon,
      keywords,
      build: () => spec,
    };
    byId.set(entry.id, entry);
    builtIn.push(entry);
  }
  const sections: Section[] = [{ title: BUILT_IN_SECTION, entries: builtIn }];
  const seeds = loadSeeds();
  for (const category of seedCategories()) {
    const entries: Entry[] = [];
    for (const seed of seeds) {
      if (seed.category !== category || byId.has(seed.id)) continue;
      const entry: Entry = {
        id: seed.id,
        title: seed.title,
        category,
        kind: seed.kind,
        icon: iconFor(seedIcon(seed)),
        keywords: seedKeywords(seed),
        build: () => seedToPromptSpec(seed, opts),
      };
      byId.set(seed.id, entry);
      entries.push(entry);
    }
    if (entries.length > 0) sections.push({ title: category, entries });
  }
  return { byId, sections };
}

function parseRecent(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

async function loadRecent(): Promise<string[]> {
  try {
    return parseRecent(await LocalStorage.getItem<string>(RECENT_KEY));
  } catch {
    return [];
  }
}

function saveRecent(ids: string[]): void {
  LocalStorage.setItem(RECENT_KEY, JSON.stringify(ids)).catch(() => undefined);
}

function reportFailure(err: unknown): void {
  void showToast({
    style: Toast.Style.Failure,
    title: "Action failed",
    message: err instanceof Error ? err.message : String(err),
  });
}

export default function AiCommands(props: LaunchProps): ReactElement {
  const { push } = useNavigation();
  const [searchText, setSearchText] = useState(props.fallbackText ?? "");
  const [recent, setRecent] = useState<string[] | null>(null);
  const { model, prefs, catalog } = useMemo(() => {
    const raw = getPreferenceValues<Preferences.AiCommands>();
    const common = readCommonPrefs();
    return { model: readModelPref(raw.model), prefs: common, catalog: buildCatalog(common) };
  }, []);

  useEffect(() => {
    let active = true;
    void loadRecent().then((ids) => {
      if (active) setRecent(ids);
    });
    return () => {
      active = false;
    };
  }, []);

  const recentEntries = (recent ?? [])
    .map((id) => catalog.byId.get(id))
    .filter((entry): entry is Entry => entry !== undefined);

  const launch = (entry: Entry): void => {
    const next = [entry.id, ...(recent ?? []).filter((id) => id !== entry.id)].slice(0, RECENT_LIMIT);
    setRecent(next);
    saveRecent(next);
    push(<ResultView commandId="ai-commands" spec={entry.build()} modelPref={model} prefs={prefs} />);
  };

  const copyPrompt = (entry: Entry): void => {
    Clipboard.copy(entry.build().system)
      .then(() => showToast({ style: Toast.Style.Success, title: "Prompt copied" }))
      .catch(reportFailure);
  };

  const renderItem = (entry: Entry, sectionKey: string, subtitle?: string): ReactElement => (
    <List.Item
      key={`${sectionKey}:${entry.id}`}
      id={`${sectionKey}:${entry.id}`}
      title={entry.title}
      subtitle={subtitle}
      icon={entry.icon}
      keywords={entry.keywords}
      accessories={[{ tag: { value: entry.kind, color: entry.kind === "generate" ? Color.Purple : Color.Blue } }]}
      actions={
        <ActionPanel>
          <Action title="Run" icon={Icon.Play} onAction={() => launch(entry)} />
          <Action
            title="Copy Prompt"
            icon={Icon.CopyClipboard}
            shortcut={{ key: "c", modifiers: ["cmd"] }}
            onAction={() => copyPrompt(entry)}
          />
          <ActionPanel.Section title="Settings">
            <Action
              title="Open Extension Preferences"
              icon={Icon.Cog}
              shortcut={{ key: ",", modifiers: ["cmd"] }}
              onAction={() => void openExtensionPreferences().catch(reportFailure)}
            />
            <Action
              title="Open Command Preferences"
              icon={Icon.Cog}
              onAction={() => void openCommandPreferences().catch(reportFailure)}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );

  return (
    <List
      searchBarPlaceholder="Search AI commands..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering
      isLoading={recent === null}
    >
      {recentEntries.length > 0 ? (
        <List.Section title="Recent">
          {recentEntries.map((entry) => renderItem(entry, "recent", entry.category))}
        </List.Section>
      ) : null}
      {catalog.sections.map((section) => (
        <List.Section key={section.title} title={section.title}>
          {section.entries.map((entry) => renderItem(entry, section.title))}
        </List.Section>
      ))}
    </List>
  );
}
