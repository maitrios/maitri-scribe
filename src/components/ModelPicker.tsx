import { Action, ActionPanel, Color, Icon, List, showToast, Toast, useNavigation } from "@vicinae/api";
import { useEffect, useState, type ReactElement } from "react";
import { listModels, type ModelOption } from "../lib/catalog";
import { ALL_COMMANDS, clearModels, resolveModel, saveModel } from "../lib/model-store";
import { OPENAI_BASE_URL } from "../lib/models";
import { TransformError, type ProviderId, type Tier } from "../lib/types";
import { PROVIDER_LABELS, resolveProviderId, type ProviderConfig } from "../providers";
import { trimBaseUrl } from "../providers/openai";

export const COMMAND_SCOPES: { id: string; title: string; tier: Tier }[] = [
  { id: "fix-grammar", title: "Fix Spelling and Grammar", tier: "fast" },
  { id: "improve-writing", title: "Improve Writing", tier: "quality" },
  { id: "ai-commands", title: "AI Commands", tier: "quality" },
];

export interface ModelPickerProps {
  config: ProviderConfig;
  scope?: string;
  tier?: Tier;
  onChanged?: () => void;
}

interface Loaded {
  provider: ProviderId;
  options: ModelOption[];
  current: string;
}

function failure(err: unknown): void {
  void showToast({
    style: Toast.Style.Failure,
    title: err instanceof Error ? err.message : String(err),
    message: err instanceof TransformError ? err.hint : undefined,
  });
}

function recommendedTag(option: ModelOption, tier: Tier | undefined): { value: string; color: Color } | null {
  const tiers = tier ? option.recommendedFor.filter((candidate) => candidate === tier) : option.recommendedFor;
  if (tiers.length === 0) return null;
  const text = tier
    ? "Recommended"
    : tiers.map((candidate) => (candidate === "fast" ? "Recommended for Fix Grammar" : "Recommended for Writing")).join(", ");
  return { value: text, color: Color.Green };
}

export function ModelPicker({ config, scope, tier, onChanged }: ModelPickerProps): ReactElement {
  const { pop } = useNavigation();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      const provider = await resolveProviderId(config);
      const options = await listModels(provider, config, controller.signal);
      const customEndpoint = provider === "openai" && trimBaseUrl(config.openaiBaseUrl) !== OPENAI_BASE_URL;
      const current = await resolveModel({
        provider,
        commandId: scope ?? ALL_COMMANDS,
        tier: tier ?? "quality",
        noDefault: customEndpoint,
      });
      if (!controller.signal.aborted) setLoaded({ provider, options, current });
    })().catch((err: unknown) => {
      if (!controller.signal.aborted) setError(err);
    });
    return () => controller.abort();
  }, [config, scope, tier]);

  const choose = (provider: ProviderId, model: string, scopes: string[]): void => {
    Promise.all(scopes.map((target) => saveModel(provider, target, model)))
      .then(() => showToast({ style: Toast.Style.Success, title: `Using ${model}` }))
      .then(() => {
        pop();
        onChanged?.();
      })
      .catch(failure);
  };

  const reset = (provider: ProviderId): void => {
    clearModels(provider, [ALL_COMMANDS, ...COMMAND_SCOPES.map((entry) => entry.id)])
      .then(() => showToast({ style: Toast.Style.Success, title: "Back to recommended models" }))
      .then(() => {
        pop();
        onChanged?.();
      })
      .catch(failure);
  };

  const options = loaded
    ? [...loaded.options].sort(
        (a, b) => Number(recommendedTag(b, tier) !== null) - Number(recommendedTag(a, tier) !== null),
      )
    : [];

  return (
    <List
      isLoading={loaded === null && error === null}
      navigationTitle={loaded ? `Models: ${PROVIDER_LABELS[loaded.provider]}` : "Models"}
      searchBarPlaceholder="Search models..."
    >
      {error !== null ? (
        <List.EmptyView
          title={error instanceof Error ? error.message : "Could not load models"}
          description={error instanceof TransformError ? error.hint : undefined}
          icon={Icon.Exclamationmark}
        />
      ) : null}
      {options.map((option) => {
        const tag = recommendedTag(option, tier);
        const provider = loaded?.provider ?? "claude-cli";
        const accessories = [];
        if (tag) accessories.push({ tag });
        if (option.id === loaded?.current) accessories.push({ icon: Icon.Checkmark, tooltip: "In use" });
        return (
          <List.Item
            key={option.id}
            title={option.label}
            subtitle={option.label === option.id ? undefined : option.id}
            keywords={[option.id]}
            accessories={accessories}
            actions={
              <ActionPanel>
                {scope ? (
                  <Action title="Use for This Command" icon={Icon.Check} onAction={() => choose(provider, option.id, [scope])} />
                ) : null}
                <Action
                  title="Use for All Commands"
                  icon={Icon.Check}
                  onAction={() => choose(provider, option.id, [ALL_COMMANDS])}
                />
                {!scope
                  ? COMMAND_SCOPES.map((entry) => (
                      <Action
                        key={entry.id}
                        title={`Use for ${entry.title}`}
                        icon={Icon.Check}
                        onAction={() => choose(provider, option.id, [entry.id])}
                      />
                    ))
                  : null}
                <Action title="Reset to Recommended" icon={Icon.ArrowCounterClockwise} onAction={() => reset(provider)} />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
