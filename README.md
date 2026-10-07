# AI Writer

A [Vicinae](https://vicinae.com) extension that fixes, rewrites or transforms whatever text you have highlighted, using the Claude Code CLI you are already logged into. No API key, no new account.

Highlight text in any app, run a command, and the result comes back as a word-level diff. Press Enter to paste it over the original, or Ctrl+Enter to copy it instead.

## Commands

| Command | Default model | What it does |
| --- | --- | --- |
| Fix Spelling and Grammar | `haiku` | Corrects the selection with the minimum edits and shows the changes as a diff. |
| Improve Writing | `sonnet` | Rewrites for clarity while keeping your voice. Also previewed as a diff. |
| AI Commands | `sonnet` | A picker with all 68 of Raycast's public prompt seeds that operate on selected text, plus the two built-ins above. Rewrites show a diff. Generators (summaries, explanations, code and so on) show the result as markdown. |

## How it works

1. You highlight text and run a command. If nothing is selected, the clipboard is used instead.
2. The text is sent to the Claude Code CLI in print mode with a system prompt for that command.
3. The reply is shown as a word-level diff against your original.
4. Enter pastes the result back into the app you came from. Ctrl+Enter copies it to the clipboard instead.

## Requirements

- Vicinae 0.29 or newer. The `@vicinae/api` version in `package.json` has to match the Vicinae you have installed, so bump it if you are on a newer release.
- Node 20 or newer, only if you build from source.
- The [Claude Code CLI](https://github.com/anthropics/claude-code) installed and logged in:

  ```bash
  claude auth login
  ```

  The extension uses that login. There is no API key to configure.

The `claude` binary is auto-detected from `PATH`, `~/.local/bin`, `~/.claude/local`, mise, and finally your login shell. If it lives somewhere else, set the **Claude CLI Path** preference.

## Install

### From a release

Grab `vicinae-ai-writer.tar.gz` from the latest GitHub release. The contents sit at the archive root, so it unpacks straight into the extensions directory:

```bash
sha256sum -c vicinae-ai-writer.tar.gz.sha256
mkdir -p ~/.local/share/vicinae/extensions/ai-writer
tar -xzf vicinae-ai-writer.tar.gz -C ~/.local/share/vicinae/extensions/ai-writer
```

### From source

```bash
npm install
npm run build
```

`npm run build` runs `vici build`, which installs into `~/.local/share/vicinae/extensions/ai-writer`. Vicinae picks it up without a restart.

## Develop

```bash
npm run dev          # vici develop, hot reloads into the running Vicinae
npm test             # node test runner over test/*.test.ts
npm run typecheck    # tsc --noEmit
npm run seeds        # re-import the Raycast prompt seeds
```

CI runs the typecheck, the tests and a build on every push and pull request. Releases are described in [RELEASING.md](RELEASING.md) and changes are tracked in [CHANGELOG.md](CHANGELOG.md).

## What actually runs

You should know what a launcher extension does with your text and your CLI. Each command shells out exactly once, like this:

```bash
claude -p "<instruction>" \
  --model <model> \
  --fallback-model <fallback> \
  --output-format json \
  --no-session-persistence \
  --max-turns 1 \
  --tools "" \
  --strict-mcp-config \
  --mcp-config '{"mcpServers":{}}' \
  --system-prompt "<prompt>" \
  [--effort low] \
  [--max-budget-usd 0.25]
```

The selected text goes in on stdin, wrapped in `<text>` tags. The process runs from a temp directory, so no project `CLAUDE.md`, hooks or MCP servers get loaded, and tools are switched off. `--effort` is only passed for models that support it, so not for Haiku. `--bare` is not used because it cannot see a claude.ai login.

## Privacy

Your selected text is sent to Anthropic through your Claude login, the same as if you had typed it into Claude Code. Nothing is stored locally and sessions are not persisted, so every run starts from zero.

## Preferences

Extension-wide, in the extension's settings inside Vicinae:

| Preference | Default | What it does |
| --- | --- | --- |
| Claude CLI Path | empty (auto-detect) | Full path to the `claude` binary. Leave it empty to auto-detect from `PATH`, `~/.local/bin`, `~/.claude/local`, mise and your login shell. |
| Fallback Model | `sonnet` | Passed as `--fallback-model` when the primary model is overloaded. If it equals the primary, `haiku` is used instead. |
| Effort | `low` | Reasoning effort for models that support it. Not sent for Haiku. `low`, `medium` or `high`. |
| Diff Style | Colored words | How rewrites are previewed before you paste: colored words, markdown (strikethrough and bold), or a unified diff. |
| Style (Never introduce em dashes) | on | Adds a rule to every prompt so the model reaches for commas, periods or colons instead. |
| Extra Style Rules | empty | Appended to every prompt. For example `Use British spelling`. |
| Timeout (seconds) | `60` | The Claude CLI is killed after this long. |
| Max Cost per Run (USD) | `0.25` | Passed as `--max-budget-usd` so a runaway call cannot get expensive. |

Per command:

| Command | Preference | Default | What it does |
| --- | --- | --- | --- |
| Fix Spelling and Grammar | Model | `haiku` | Claude model alias or id for this command (`haiku`, `sonnet`, `opus`, `fable`). |
| Fix Spelling and Grammar | Prompt Override | none | A text file whose contents replace the built-in system prompt for this command. |
| Improve Writing | Model | `sonnet` | Same as above. |
| Improve Writing | Prompt Override | none | Same as above. |
| AI Commands | Model | `sonnet` | Used for every command in the picker. |

## Hotkeys and deeplinks

Every command has a deeplink, so you can bind it anywhere:

```bash
vicinae vicinae://launch/@beyera/ai-writer/fix-grammar
vicinae vicinae://launch/@beyera/ai-writer/improve-writing
vicinae vicinae://launch/@beyera/ai-writer/ai-commands
vicinae "vicinae://launch/@beyera/ai-writer/ai-commands?fallbackText=shorter"
```

`vicinae deeplink <url>` works too. The `fallbackText` query on the AI Commands link opens the picker prefiltered to that search.

Installed from the Vicinae store rather than from source? The extension id becomes `store.vicinae.ai-writer`, so the links read `vicinae://launch/@beyera/store.vicinae.ai-writer/fix-grammar` and so on.

The simplest option is Vicinae's own per-command shortcuts in its settings. If you would rather bind at the compositor level, for Hyprland:

```ini
bind = SUPER ALT, P, exec, vicinae vicinae://launch/@beyera/ai-writer/fix-grammar
bind = SUPER ALT, I, exec, vicinae vicinae://launch/@beyera/ai-writer/improve-writing
bind = SUPER ALT, W, exec, vicinae vicinae://launch/@beyera/ai-writer/ai-commands
```

Or the maitri and Omarchy style Lua binding:

```lua
o.bind("SUPER + ALT + P", "Fix spelling and grammar", "maitri-launch-vicinae vicinae://launch/@beyera/ai-writer/fix-grammar")
```

Hyprland tip: the paste goes to whatever window has focus once Vicinae closes. If it keeps landing in the wrong window, `misc { focus_on_activate = true }` in your Hyprland config usually sorts it.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Not logged in" | Run `claude auth login` in a terminal. |
| "Claude CLI not found" | Set the Claude CLI Path preference to the full path of the binary. |
| Nothing selected | The app did not publish a PRIMARY selection. Copy the text first and the clipboard is used instead. |
| Slow first call | The CLI boots Node on every run, which takes roughly one to two seconds before the model even starts. That part is the same for every model. |

## Roadmap

No dates, just the honest list:

- Streaming output instead of waiting for the whole reply.
- Accept or reject individual hunks in the diff.
- Edit prompts inside the launcher rather than through a file.
- More providers: Anthropic API key, OpenAI-compatible endpoints, Ollama.
- Chunking for very long selections.
- Submission to the Vicinae store.

## Credits

- Prompt seeds come from [raycast/ray-so](https://github.com/raycast/ray-so) (MIT, Raycast Technologies Ltd).
- Word diffs by [jsdiff](https://github.com/kpdecker/jsdiff).
- Built on [@vicinae/api](https://github.com/vicinaehq/vicinae).

## License

MIT. See [LICENSE](LICENSE).
