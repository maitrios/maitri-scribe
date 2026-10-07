import {
  Action,
  ActionPanel,
  closeMainWindow,
  Color,
  Detail,
  Icon,
  openCommandPreferences,
  openExtensionPreferences,
  PopToRootType,
  showToast,
  Toast,
  type Keyboard,
} from "@vicinae/api";
import { useCallback, useMemo, useState, type ReactElement } from "react";
import { useTransform } from "../hooks/useTransform";
import { countChanges, renderDiff, renderPlain, wordCount } from "../lib/diff";
import { describeModel } from "../lib/models";
import { copyAndClose, pasteAndClose } from "../lib/paste";
import type { CommonPrefs } from "../lib/preferences";
import type { PromptSpec } from "../lib/types";

export interface ResultViewProps {
  spec: PromptSpec;
  model: string;
  prefs: CommonPrefs;
}

type ViewMode = "diff" | "clean" | "original" | "result";

const REWRITE_MODES: readonly ViewMode[] = ["diff", "clean", "original"];
const GENERATE_MODES: readonly ViewMode[] = ["result", "original"];
const MODE_LABELS: Record<ViewMode, string> = {
  diff: "Diff",
  clean: "Clean",
  original: "Original",
  result: "Result",
};

const EMPTY_MESSAGE =
  "Nothing to work on. Highlight text in any app, or copy it, then run this command again.";

const SHORTCUTS: Record<"copy" | "toggleView" | "regenerate" | "copyOriginal" | "preferences", Keyboard.Shortcut> = {
  copy: { key: "return", modifiers: ["cmd"] },
  toggleView: { key: "d", modifiers: ["cmd"] },
  regenerate: { key: "r", modifiers: ["cmd"] },
  copyOriginal: { key: "c", modifiers: ["cmd", "shift"] },
  preferences: { key: ",", modifiers: ["cmd"] },
};

function guarded(task: () => Promise<void>): () => void {
  return () => {
    task().catch((err: unknown) => {
      void showToast({
        style: Toast.Style.Failure,
        title: "Action failed",
        message: err instanceof Error ? err.message : String(err),
      });
    });
  };
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ResultView({ spec, model, prefs }: ResultViewProps): ReactElement {
  const { status, input, result, error, startedAt, elapsedMs, regenerate, retryInput } = useTransform(
    spec,
    model,
    prefs,
  );
  const modes = spec.kind === "generate" ? GENERATE_MODES : REWRITE_MODES;
  const [mode, setMode] = useState<ViewMode>(modes[0]);

  const cycleView = useCallback(() => {
    setMode((current) => modes[(modes.indexOf(current) + 1) % modes.length]);
  }, [modes]);

  const busy = status === "reading" || status === "running";

  const changes = useMemo(
    () => (input && result && spec.kind === "rewrite" ? countChanges(input.text, result.text) : null),
    [input, result, spec.kind],
  );

  const markdown = useMemo(() => {
    switch (status) {
      case "reading":
        return "";
      case "empty":
        return EMPTY_MESSAGE;
      case "running":
        return input ? renderPlain(input.text) : "";
      case "done": {
        if (!input || !result) return "";
        if (mode === "original") return renderPlain(input.text);
        if (spec.kind === "generate") return `${result.text.trimEnd()}\n\n---\n`;
        if (mode === "clean") return renderPlain(result.text);
        return renderDiff(input.text, result.text, prefs.diffStyle);
      }
      case "error": {
        const parts = [`**${error?.message ?? "Something went wrong"}**`];
        if (error?.hint) parts.push(error.hint);
        if (input) parts.push("---", renderPlain(input.text));
        return parts.join("\n\n");
      }
      default:
        return "";
    }
  }, [status, input, result, error, mode, spec.kind, prefs.diffStyle]);

  const inputWords = input ? wordCount(input.text) : 0;
  const metadata = input ? (
    <Detail.Metadata>
      <Detail.Metadata.Label title="Source" text={input.source === "selection" ? "Selection" : "Clipboard"} />
      <Detail.Metadata.Label title="Model" text={describeModel(result?.model ?? model)} />
      <Detail.Metadata.Label
        title="Words"
        text={result ? `${inputWords} -> ${wordCount(result.text)}` : `${inputWords}`}
      />
      {changes !== null ? (
        <Detail.Metadata.Label
          title="Changes"
          text={{ value: `${changes}`, color: changes > 0 ? Color.Green : Color.SecondaryText }}
        />
      ) : null}
      {startedAt !== null ? <Detail.Metadata.Label title="Time" text={seconds(elapsedMs)} /> : null}
      {result?.costUsd !== undefined ? (
        <Detail.Metadata.Label title="Cost" text={`$${result.costUsd.toFixed(4)}`} />
      ) : null}
      {status === "done" ? (
        <>
          <Detail.Metadata.Separator />
          <Detail.Metadata.TagList title="View">
            {modes.map((candidate) => (
              <Detail.Metadata.TagList.Item
                key={candidate}
                text={MODE_LABELS[candidate]}
                color={candidate === mode ? Color.Blue : undefined}
                onAction={() => setMode(candidate)}
              />
            ))}
          </Detail.Metadata.TagList>
        </>
      ) : null}
    </Detail.Metadata>
  ) : undefined;

  const settings = (
    <ActionPanel.Section title="Settings">
      <Action
        title="Open Extension Preferences"
        icon={Icon.Cog}
        shortcut={SHORTCUTS.preferences}
        onAction={guarded(openExtensionPreferences)}
      />
      <Action title="Open Command Preferences" icon={Icon.Cog} onAction={guarded(openCommandPreferences)} />
    </ActionPanel.Section>
  );

  const copyOriginal = input ? (
    <Action
      title="Copy Original"
      icon={Icon.CopyClipboard}
      shortcut={SHORTCUTS.copyOriginal}
      onAction={guarded(() => copyAndClose(input.text, "Original copied"))}
    />
  ) : null;

  let actions: ReactElement;
  if (status === "done" && input && result) {
    actions = (
      <ActionPanel>
        <Action title="Paste" icon={Icon.CopyClipboard} onAction={guarded(() => pasteAndClose(result.text))} />
        <Action
          title="Copy"
          icon={Icon.CopyClipboard}
          shortcut={SHORTCUTS.copy}
          onAction={guarded(() => copyAndClose(result.text))}
        />
        <Action title="Toggle View" icon={Icon.Switch} shortcut={SHORTCUTS.toggleView} onAction={cycleView} />
        <Action title="Regenerate" icon={Icon.ArrowClockwise} shortcut={SHORTCUTS.regenerate} onAction={regenerate} />
        {copyOriginal}
        {settings}
      </ActionPanel>
    );
  } else if (status === "running") {
    actions = (
      <ActionPanel>
        <Action
          title="Cancel and Close"
          icon={Icon.Xmark}
          onAction={guarded(() => closeMainWindow({ popToRootType: PopToRootType.Immediate }))}
        />
        {settings}
      </ActionPanel>
    );
  } else if (status === "empty" || status === "error") {
    actions = (
      <ActionPanel>
        <Action
          title="Try Again"
          icon={Icon.ArrowClockwise}
          onAction={status === "empty" ? retryInput : regenerate}
        />
        {copyOriginal}
        {settings}
      </ActionPanel>
    );
  } else {
    actions = <ActionPanel>{settings}</ActionPanel>;
  }

  const loading = { isLoading: busy } as Record<string, unknown>;

  return (
    <Detail
      {...loading}
      navigationTitle={busy ? `${spec.title}...` : spec.title}
      markdown={markdown}
      metadata={metadata}
      actions={actions}
    />
  );
}
