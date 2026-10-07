/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** Provider - Auto uses the Claude CLI when it is installed, otherwise an API key you have set below */
	"provider"?: "auto" | "claude-cli" | "anthropic" | "openai";

	/** Claude CLI Path - Leave empty to auto-detect from PATH, ~/.local/bin, ~/.claude/local, mise and your login shell */
	"claudePath"?: string;

	/** Anthropic API Key - Used when the provider is Anthropic API, or in Auto when the Claude CLI is not installed */
	"anthropicApiKey"?: string;

	/** OpenAI API Key - Used when the provider is OpenAI API, or in Auto as a last resort. Optional for local endpoints */
	"openaiApiKey"?: string;

	/** OpenAI Base URL - Point at any OpenAI-compatible server, for example Ollama at http://localhost:11434/v1. Empty means api.openai.com. Use https for anything that is not on your own machine, since your key is sent with every request */
	"openaiBaseUrl"?: string;

	/** Speed - Skips extended thinking and background telemetry on every run. Turn it off for deeper rewrites */
	"fastMode"?: boolean;

	/** Fallback Model - Passed as --fallback-model when the primary model is overloaded (haiku is used when this equals the primary) */
	"fallbackModel"?: string;

	/** Effort - Reasoning effort for models that support it (not sent for Haiku) */
	"effort"?: "low" | "medium" | "high";

	/** Diff Style - How rewrites are previewed before you paste */
	"diffStyle"?: "rich" | "markdown" | "unified";

	/** Style - Adds a rule to every prompt so the model uses commas, periods or colons instead */
	"avoidEmDashes"?: boolean;

	/** Extra Style Rules - Appended to every prompt, for example: Use British spelling */
	"styleRules"?: string;

	/** Timeout (seconds) - The Claude CLI is killed after this long */
	"timeoutSeconds"?: string;

	/** Max Cost per Run (USD) - Passed as --max-budget-usd so a runaway call cannot get expensive */
	"maxCostUsd"?: string;
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: Fix Spelling and Grammar */
	export type FixGrammar = ExtensionPreferences & {
		/** Model Override - Leave empty to use the recommended model for your provider. Choose Model (or Cmd+M in a result) overrides this */
		"model"?: string;

		/** Prompt Override - A text file whose contents replace the built-in system prompt for this command */
		"promptFile"?: string;
	}

	/** Command: Improve Writing */
	export type ImproveWriting = ExtensionPreferences & {
		/** Model Override - Leave empty to use the recommended model for your provider. Choose Model (or Cmd+M in a result) overrides this */
		"model"?: string;

		/** Prompt Override - A text file whose contents replace the built-in system prompt for this command */
		"promptFile"?: string;
	}

	/** Command: AI Commands */
	export type AiCommands = ExtensionPreferences & {
		/** Model Override - Leave empty to use the recommended model for your provider. Choose Model (or Cmd+M in a result) overrides this */
		"model"?: string;
	}

	/** Command: Choose Model */
	export type ChooseModel = ExtensionPreferences & {
		
	}
}

declare namespace Arguments {
  /** Command: Fix Spelling and Grammar */
	export type FixGrammar = {
		
	}

	/** Command: Improve Writing */
	export type ImproveWriting = {
		
	}

	/** Command: AI Commands */
	export type AiCommands = {
		
	}

	/** Command: Choose Model */
	export type ChooseModel = {
		
	}
}