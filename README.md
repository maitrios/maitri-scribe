# Scribe

A [Vicinae](https://vicinae.com) extension that fixes, rewrites or transforms whatever text you have highlighted, using the Claude Code CLI you are already logged into. No API key, no new account.

Highlight text in any app, run a command, and the result comes back as a word-level diff. Press Enter to paste it over the original, or Ctrl+Enter to copy it instead.

## Commands

| Command | Default model | What it does |
| --- | --- | --- |
| Fix Spelling and Grammar | `haiku` | Corrects the selection with the minimum edits and shows the changes as a diff. |
| Improve Writing | `sonnet` | Rewrites for clarity while keeping your voice. Also previewed as a diff. |
| AI Commands | `sonnet` | A picker with all 68 of Raycast's public prompt seeds that operate on selected text, plus the two built-ins above. Rewrites show a diff. Generators (summaries, explanations, code and so on) show the result as markdown. |

| Choose Model | n/a | Lists the models your provider offers, loaded live, with the recommended ones marked. Pick one for a single command or all of them. |

The model columns above are the Claude CLI defaults. With an API provider the recommended model is the newest Haiku or mini for Fix Spelling and Grammar and the newest Sonnet or base GPT for the rest.

## Providers

| Provider | Needs | Notes |
| --- | --- | --- |
| Auto (default) | Nothing extra | Uses the Claude CLI when it is installed, otherwise the Anthropic key, otherwise the OpenAI key or custom base URL. |
| Claude CLI | `claude auth login` | No API key. Billed to your Claude login. |
| Anthropic API | Anthropic API key | Direct HTTPS call, no process spawn. |
| OpenAI API or compatible | OpenAI API key, or just a base URL | Works with Ollama, LM Studio, OpenRouter and anything else that speaks `/v1/chat/completions`. |

Models are chosen in this order: the one you picked with **Choose Model** (or Cmd+M on a result), then the command's Model Override preference, then the recommended default for the provider. Picks are stored per provider, so switching providers never leaves you with a model name the new one has never heard of. For a custom base URL there is no default, so pick one once with Choose Model.

## Speed

Fast mode is on by default and only touches the Claude CLI. It turns off extended thinking and the CLI's background telemetry for each run. On a one-sentence fix with Haiku that took a run from about 3.4s to about 1.3s with identical output. Use the Anthropic API provider to skip the CLI's startup cost entirely. Turn Fast mode off if you want deeper rewrites from a bigger model.

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

Grab `maitri-scribe.tar.gz` from the latest GitHub release. The contents sit at the archive root, so it unpacks straight into the extensions directory:

```bash
sha256sum -c maitri-scribe.tar.gz.sha256
mkdir -p ~/.local/share/vicinae/extensions/scribe
tar -xzf maitri-scribe.tar.gz -C ~/.local/share/vicinae/extensions/scribe
```

### From source

```bash
npm install
npm run build
```

`npm run build` runs `vici build`, which installs into `~/.local/share/vicinae/extensions/scribe`. Vicinae picks it up without a restart.

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

The selected text goes in on stdin, wrapped in `<text>` tags. The process runs from a temp directory, so no project `CLAUDE.md`, hooks or MCP servers get loaded, and tools are switched off. With Fast mode on (the default) the process also gets `MAX_THINKING_TOKENS=0`, `DISABLE_TELEMETRY=1` and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` in its environment. `--effort` is only passed for models that support it, so not for Haiku. `--bare` is not used because it cannot see a claude.ai login.

The API providers make one HTTPS request per run, with no tools and no stored state:

```bash
# Anthropic API
POST https://api.anthropic.com/v1/messages          # x-api-key, anthropic-version: 2023-06-01
# body: model, max_tokens, system, messages[{role: user, content: "<instruction>\n\n<text>...</text>"}]

# OpenAI or compatible
POST <base url>/chat/completions                     # Authorization: Bearer <key> (omitted when no key is set)
# body: model, messages[{role: system}, {role: user, content: "<instruction>\n\n<text>...</text>"}]
```

Choose Model additionally calls `GET /models` on the active provider to build its list.

If the Claude CLI is installed but logged out and an Anthropic API key is set, Auto retries that run through the Anthropic API.

## Privacy

Your selected text goes to whichever provider is active, and only that one:

- Claude CLI: Anthropic, through your Claude login, the same as if you had typed it into Claude Code.
- Anthropic API: Anthropic, with your API key.
- OpenAI API or compatible: OpenAI, or whatever server your base URL points at. With a local server such as Ollama the text never leaves your machine.

Nothing about your text is stored locally and the CLI is run without session persistence. The only things kept are small settings in Vicinae's local storage: your recent AI Commands and the models you picked with Choose Model. API keys live in Vicinae's preferences, are sent only to the provider they belong to, and are never logged. Use an `https://` base URL for anything that is not on your own machine, because the key is sent with every request.

## Preferences

Extension-wide, in the extension's settings inside Vicinae:

| Preference | Default | What it does |
| --- | --- | --- |
| Provider | Auto | `auto`, `claude-cli`, `anthropic` or `openai`. |
| Anthropic API Key | empty | Stored by Vicinae as a password preference. |
| OpenAI API Key | empty | Optional for local endpoints. |
| OpenAI Base URL | empty (api.openai.com) | Any OpenAI-compatible server, for example `http://localhost:11434/v1`. |
| Fast mode | on | Claude CLI only. Skips thinking and telemetry. |
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
| Fix Spelling and Grammar | Model Override | empty (recommended) | Model alias or id for this command. Choose Model takes priority over this. |
| Fix Spelling and Grammar | Prompt Override | none | A text file whose contents replace the built-in system prompt for this command. |
| Improve Writing | Model Override | empty (recommended) | Same as above. |
| Improve Writing | Prompt Override | none | Same as above. |
| AI Commands | Model Override | empty (recommended) | Used for every command in the picker. |

## Hotkeys and deeplinks

Every command has a deeplink, so you can bind it anywhere:

```bash
vicinae vicinae://launch/@maitrios/scribe/fix-grammar
vicinae vicinae://launch/@maitrios/scribe/improve-writing
vicinae vicinae://launch/@maitrios/scribe/ai-commands
vicinae "vicinae://launch/@maitrios/scribe/ai-commands?fallbackText=shorter"
```

`vicinae deeplink <url>` works too. The `fallbackText` query on the AI Commands link opens the picker prefiltered to that search.

Installed from the Vicinae store rather than from source? The extension id becomes `store.vicinae.scribe`, so the links read `vicinae://launch/@maitrios/store.vicinae.scribe/fix-grammar` and so on.

The simplest option is Vicinae's own per-command shortcuts in its settings. If you would rather bind at the compositor level, for Hyprland:

```ini
bind = SUPER ALT, P, exec, vicinae vicinae://launch/@maitrios/scribe/fix-grammar
bind = SUPER ALT, I, exec, vicinae vicinae://launch/@maitrios/scribe/improve-writing
bind = SUPER ALT, W, exec, vicinae vicinae://launch/@maitrios/scribe/ai-commands
```

Or the maitri and Omarchy style Lua binding:

```lua
o.bind("SUPER + ALT + P", "Fix spelling and grammar", "maitri-launch-vicinae vicinae://launch/@maitrios/scribe/fix-grammar")
```

Hyprland tip: the paste goes to whatever window has focus once Vicinae closes. If it keeps landing in the wrong window, `misc { focus_on_activate = true }` in your Hyprland config usually sorts it.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Not logged in" | Run `claude auth login` in a terminal. |
| "Claude CLI not found" | Set the Claude CLI Path preference to the full path of the binary. |
| Nothing selected | The app did not publish a PRIMARY selection. Copy the text first and the clipboard is used instead. |
| "No AI provider available" | Install and log in to the Claude CLI, or add an Anthropic or OpenAI API key in the preferences. |
| "No model selected" | Custom OpenAI base URLs have no default model. Run Choose Model once. |
| 404 from an API provider | The model id is not available to that key. Run Choose Model and pick one from the list. |
| Slow first call | The CLI boots Node on every run, which takes roughly one to two seconds before the model even starts. That part is the same for every model. |

## Roadmap

No dates, just the honest list:

- Streaming output instead of waiting for the whole reply.
- Accept or reject individual hunks in the diff.
- Edit prompts inside the launcher rather than through a file.
- More providers (Gemini, Bedrock).
- Chunking for very long selections.
- Submission to the Vicinae store.

## Credits

- Prompt seeds come from [raycast/ray-so](https://github.com/raycast/ray-so) (MIT, Raycast Technologies Ltd). The license text is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- Word diffs by [jsdiff](https://github.com/kpdecker/jsdiff).
- Built on [@vicinae/api](https://github.com/vicinaehq/vicinae).

## License

MIT. See [LICENSE](LICENSE).
