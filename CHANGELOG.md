# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

## [0.1.0] - 2026-09-26

Initial release.
