import { showToast, Toast } from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { countChanges, wordCount } from "../lib/diff";
import { readInput } from "../lib/input";
import { describeModel, pickFallback } from "../lib/models";
import type { CommonPrefs } from "../lib/preferences";
import { sanitizeOutput } from "../lib/sanitize";
import {
  TransformError,
  type CommandKind,
  type PromptSpec,
  type TextInput,
  type TransformResult,
} from "../lib/types";
import { createProvider } from "../providers";

export type TransformStatus = "reading" | "empty" | "running" | "done" | "error";

export interface TransformState {
  status: TransformStatus;
  input: TextInput | null;
  result: TransformResult | null;
  error: TransformError | null;
  startedAt: number | null;
  elapsedMs: number;
  attempt: number;
}

export interface TransformHandle extends TransformState {
  regenerate: () => void;
  retryInput: () => void;
}

interface StatusToast {
  style: Toast.Style;
  title: string;
  message?: string;
}

const SUCCESS_TOAST_MS = 2500;
const TICK_MS = 100;
const TITLE_LIMIT = 80;

const INITIAL_STATE: TransformState = {
  status: "reading",
  input: null,
  result: null,
  error: null,
  startedAt: null,
  elapsedMs: 0,
  attempt: 0,
};

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 3).trimEnd()}...` : text;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function summarize(kind: CommandKind, original: string, output: string, costUsd?: number): string {
  const stat =
    kind === "generate" ? plural(wordCount(output), "word") : plural(countChanges(original, output), "change");
  return costUsd === undefined ? stat : `${stat}, $${costUsd.toFixed(4)}`;
}

function isCancelled(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || /cancel/i.test(err.message));
}

function asTransformError(err: unknown): TransformError {
  if (err instanceof TransformError) return err;
  if (err instanceof Error) return new TransformError(err.message || err.name);
  return new TransformError(String(err));
}

export function useTransform(spec: PromptSpec, model: string, prefs: CommonPrefs): TransformHandle {
  const [state, setState] = useState<TransformState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;
  const argsRef = useRef({ spec, model, prefs });
  argsRef.current = { spec, model, prefs };

  const mountedRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const readTokenRef = useRef(0);
  const toastRef = useRef<Promise<Toast> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = useCallback((changes: Partial<TransformState>) => {
    if (!mountedRef.current) return;
    setState((prev) => ({ ...prev, ...changes }));
  }, []);

  const clearToastTimer = useCallback(() => {
    if (toastTimerRef.current !== null) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  const hideToast = useCallback(async () => {
    clearToastTimer();
    const pending = toastRef.current;
    toastRef.current = null;
    if (!pending) return;
    try {
      const toast = await pending;
      await toast.hide();
    } catch {
      return;
    }
  }, [clearToastTimer]);

  const showStatus = useCallback(
    async (next: StatusToast) => {
      clearToastTimer();
      const pending = toastRef.current;
      if (pending) {
        try {
          const toast = await pending;
          toast.message = next.message;
          toast.title = next.title;
          toast.style = next.style;
          return;
        } catch {
          toastRef.current = null;
        }
      }
      const shown = showToast({ style: next.style, title: next.title, message: next.message });
      toastRef.current = shown;
      await shown;
    },
    [clearToastTimer],
  );

  const hideLater = useCallback(() => {
    clearToastTimer();
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      void hideToast();
    }, SUCCESS_TOAST_MS);
  }, [clearToastTimer, hideToast]);

  const run = useCallback(
    (input: TextInput, attempt: number) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const { spec: currentSpec, model: currentModel, prefs: currentPrefs } = argsRef.current;
      const startedAt = Date.now();
      const isCurrent = () =>
        mountedRef.current && controllerRef.current === controller && !controller.signal.aborted;

      patch({ status: "running", input, result: null, error: null, startedAt, elapsedMs: 0, attempt });
      void showStatus({ style: Toast.Style.Animated, title: `Asking Claude (${describeModel(currentModel)})` });

      const work = async (): Promise<TransformResult> => {
        const provider = await createProvider({ claudePath: currentPrefs.claudePath });
        return provider.transform({
          system: currentSpec.system,
          instruction: currentSpec.instruction,
          text: input.text,
          model: currentModel,
          fallbackModel: pickFallback(currentModel, currentPrefs.fallbackModel),
          effort: currentPrefs.effort,
          timeoutMs: currentPrefs.timeoutMs,
          maxCostUsd: currentPrefs.maxCostUsd,
          signal: controller.signal,
        });
      };

      work().then(
        (raw) => {
          if (!isCurrent()) return;
          const elapsedMs = Date.now() - startedAt;
          const result: TransformResult = { ...raw, text: sanitizeOutput(raw.text, input.text) };
          patch({ status: "done", result, error: null, elapsedMs });
          void showStatus({
            style: Toast.Style.Success,
            title: `Done in ${(elapsedMs / 1000).toFixed(1)}s`,
            message: summarize(currentSpec.kind, input.text, result.text, result.costUsd),
          }).then(hideLater);
        },
        (err: unknown) => {
          if (!isCurrent()) return;
          const error = asTransformError(err);
          patch({ status: "error", error, elapsedMs: Date.now() - startedAt });
          if (isCancelled(err)) {
            void hideToast();
            return;
          }
          void showStatus({
            style: Toast.Style.Failure,
            title: truncate(error.message, TITLE_LIMIT),
            message: error.hint,
          });
        },
      );
    },
    [patch, showStatus, hideLater, hideToast],
  );

  const start = useCallback(async () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    const token = ++readTokenRef.current;
    patch({ status: "reading", input: null, result: null, error: null, startedAt: null, elapsedMs: 0 });
    await hideToast();
    const input = await readInput().catch(() => null);
    if (!mountedRef.current || readTokenRef.current !== token) return;
    if (!input) {
      patch({ status: "empty" });
      void showStatus({
        style: Toast.Style.Failure,
        title: "Nothing selected",
        message: "Highlight text or copy it first",
      });
      return;
    }
    run(input, 1);
  }, [patch, hideToast, showStatus, run]);

  const regenerate = useCallback(() => {
    const { input, attempt } = stateRef.current;
    if (input) {
      run(input, attempt + 1);
    } else {
      void start();
    }
  }, [run, start]);

  const retryInput = useCallback(() => {
    void start();
  }, [start]);

  useEffect(() => {
    mountedRef.current = true;
    void start();
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      controllerRef.current = null;
      void hideToast();
    };
  }, [start, hideToast]);

  useEffect(() => {
    if (state.status !== "running" || state.startedAt === null) return;
    const startedAt = state.startedAt;
    const timer = setInterval(() => {
      setState((prev) =>
        prev.status === "running" && prev.startedAt === startedAt
          ? { ...prev, elapsedMs: Date.now() - startedAt }
          : prev,
      );
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [state.status, state.startedAt]);

  return { ...state, regenerate, retryInput };
}
