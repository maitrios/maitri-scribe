# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-08

### Added

- Fix Spelling and Grammar command (Haiku by default) that corrects the selection with the minimum edits.
- Improve Writing command (Sonnet by default) that rewrites for clarity while keeping your voice.
- AI Commands picker with all 68 of Raycast's public prompt seeds that operate on selected text, plus the two built-ins.
- Word-level diff preview of every rewrite, in colored, markdown or unified style.
- Enter pastes the result back into the app you came from, Ctrl+Enter copies it instead.
- Selection input with clipboard fallback.
- Runs through the Claude Code CLI you are already logged into, no API key needed.
- Preferences for the CLI path, per-command model, fallback model, effort, diff style, the em dash rule, extra style rules, timeout, max cost per run and per-command prompt overrides.
- Deeplinks for every command so they can be bound to hotkeys.
- Anthropic API and OpenAI-compatible providers (Ollama, LM Studio, OpenRouter), with Auto picking the Claude CLI first and API keys as fallback.
- Choose Model command and Cmd+M on results: models are listed live from the provider with the recommended ones marked, and picks are stored per provider.
- Fast mode for the Claude CLI that skips extended thinking and telemetry, cutting a Haiku proofread from about 3.4s to 1.3s.
- Auto falls back to the Anthropic API when the Claude CLI is installed but logged out and a key is set.
- Third party notice for the Raycast prompt seeds.
- A quill icon in the maitri blue to lavender gradient.
- Hosted under the maitrios GitHub org as maitri-scribe; deeplinks now use the `@maitrios` author.
