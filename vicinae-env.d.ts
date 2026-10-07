/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** Claude CLI Path - Leave empty to auto-detect from PATH, ~/.local/bin, ~/.claude/local, mise and your login shell */
	"claudePath": string;

	/** Fallback Model - Passed as --fallback-model when the primary model is overloaded (haiku is used when this equals the primary) */
	"fallbackModel": string;

	/** Effort - Reasoning effort for models that support it (not sent for Haiku) */
	"effort": "low" | "medium" | "high";

	/** Diff Style - How rewrites are previewed before you paste */
	"diffStyle": "rich" | "markdown" | "unified";

	/** Style - Adds a rule to every prompt so the model uses commas, periods or colons instead */
	"avoidEmDashes": boolean;

	/** Extra Style Rules - Appended to every prompt, for example: Use British spelling */
	"styleRules": string;

	/** Timeout (seconds) - The Claude CLI is killed after this long */
	"timeoutSeconds": string;

	/** Max Cost per Run (USD) - Passed as --max-budget-usd so a runaway call cannot get expensive */
	"maxCostUsd": string;
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: Fix Spelling and Grammar */
	export type FixGrammar = ExtensionPreferences & {
		/** Model - Claude model alias or id for this command (haiku, sonnet, opus, fable) */
		"model": string;

		/** Prompt Override - A text file whose contents replace the built-in system prompt for this command */
		"promptFile": string;
	}

	/** Command: Improve Writing */
	export type ImproveWriting = ExtensionPreferences & {
		/** Model - Claude model alias or id for this command (haiku, sonnet, opus, fable) */
		"model": string;

		/** Prompt Override - A text file whose contents replace the built-in system prompt for this command */
		"promptFile": string;
	}

	/** Command: AI Commands */
	export type AiCommands = ExtensionPreferences & {
		/** Model - Claude model alias or id used for every command in the picker */
		"model": string;
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
}