# Changelog

## 0.15.1
- GLM model selector: with the GLM provider active, both the CLI toolbar and the chat topbar now show a model dropdown fed by `providers.json` `models` (editable in Settings -> Provider, comma-separated); picking one types `/model <id>` in the CLI or calls set_model in chat
- Docs note: map ALL the CLI model aliases in the GLM install's settings.json (including `ANTHROPIC_DEFAULT_FABLE_MODEL`) — an unmapped alias sends the raw Anthropic model id to the alternate gateway, which rejects it with 400 Unknown Model

## 0.15.0
- The cockpit now ALWAYS opens with a clean CLI session: the first attach of an app run discards any pty left over from previous runs (reloads and view/tab switches within the same run still keep the session alive)
- Toolbar buttons: "New chat" (`/clear`) and "History" (`/resume` — the CLI's native session picker) 
- Smarter conversation continue on relaunch: `-c` is used only when the conversation was actually started in that tab (never resumes unrelated chats from external terminals); switching provider copies the session file into the target provider's store and resumes it there with `--resume`
- GLM launch no longer passes a default `--model` from providers.json (the provider's own settings decide) — a stale model code was causing API 400 "Unknown Model"

## 0.14.1
- Fix: switching the CLI to GLM (or any relaunch) on a project with no prior conversation died with "No conversation found to continue" — `-c` is now added only when a conversation actually exists in the target provider's store; otherwise the CLI starts fresh


## 0.14.0
- CLI toolbar: provider (Anthropic/GLM), model, effort and Plan/Bypass permission-mode controls right in the tab bar. Model/effort are typed into the CLI (`/model`, `/effort`); provider and mode relaunch the CLI with the proper flags and `claude -c`, resuming the same conversation
- `pty_attach` accepts launch options (provider env, --model, --effort, --permission-mode, -c)


## 0.13.0
- The app and every new chat/tab now always open in the CLI view; switching to Chat is a manual, session-only choice (not persisted)
- Chat view redesigned in the style of claude.ai (dark): warm palette (#262624 / coral #D97757), serif prose for Claude's replies with no bubble and a ✳ marker, rounded user cards, a single rounded composer with the mic and a circular send button inside, quiet tool cards — whole app re-skinned on the same warm tokens


## 0.12.1
- Dictation language is now an explicit setting (`sttLanguage` in Settings → Telegram: Auto/Italiano/English) instead of following the UI locale — an `en-US` runtime (typical in Electron) was making Whisper TRANSLATE Italian speech into English
- Telegram voice memos use the same setting (was hardcoded to Italian) and the same transcription code path


## 0.12.0
- Dictation rebuilt on server-side Whisper (Groq/OpenAI, same key as Telegram voice memos): record with MediaRecorder, the engine transcribes — works in the **desktop app** (where Web Speech never worked) and over https on mobile
- Microphone in the **CLI view** too: floating 🎤 button, the transcribed text is typed into the terminal (you review, then press Enter)
- Web Speech API removed; clear error messages (missing key → points to Settings → Telegram)


## 0.11.0
- The main view is now the **native Claude Code CLI** (real TUI, statusline, colors) running in a persistent pty per tab — survives tab switches and page reloads (scrollback replay on re-attach). `/exit` shows a restart button
- Per-tab CLI/Chat toggle: the SDK chat view remains (default on mobile, where dictation, permission buttons and the Telegram gateway shine); sessions are independent (`/resume` inside the CLI to pick up any conversation)
- Quick actions inject into whichever view is active (typed into the CLI, or sent as chat prompts)
- Removed: the Terminal button and the session console (superseded by the real CLI); "open terminal here" in the file navigator still opens a shell panel
- Engine: `pty_attach`/`pty_kill` replace `pty_open`/`pty_close` — ptys are keyed per tab, persistent, with a 200KB scrollback buffer


## 0.10.1
- Permission requests no longer expire: the old 5-minute auto-deny silently killed long-lived prompts (e.g. reading a big plan before approving ExitPlanMode → "unknown permission request"). Like the CLI, requests now wait until decided; turn abort still cancels them
- New `permission_resolved` event: when a request is decided elsewhere (another tab, Telegram) or cancelled, every UI closes its prompt instead of showing a stale one


## 0.10.0
- Fixed the unreadable chat: tool cards were being flex-squeezed into 2px lines on long turns (`flex-shrink: 0`); markdown tables/hr/headings now styled
- Real context usage: `ctx %` now comes from the SDK (`getContextUsage`) — actual tokens vs the model's real window (e.g. 967k), not a hardcoded 200k guess
- Statusline above the composer: dir, git branch, model, effort, permission mode, context, cost, session id
- Session console: the Terminal button now defaults to a live monospace feed of the active session (tools, results, texts); new `claude`/`shell` terminals still available
- Default permission mode for new sessions (Settings → Engine, stored in engine.json); approving ExitPlanMode returns the session to that mode automatically


## 0.9.2
- PWA manifest + icons: "Add to Home screen" on Android installs Cockpit as a standalone app with its own icon

## 0.9.1
- Same-origin WebSocket: the UI works behind a TLS reverse proxy (e.g. `tailscale serve` → `https://…ts.net` with `wss://`), enabling the microphone on mobile (browsers require a secure context for dictation)
- Dictation errors are now visible: insecure-context / unsupported-browser / permission-denied messages instead of a silent red button

## 0.9.0
- MCP management from the side panel: connect your own servers (HTTP/SSE/stdio, headers, env vars, user or project scope — wraps `claude mcp add`) and remove them; the session restarts keeping the conversation
- The MCP panel is always visible (even with zero servers) so new users can add one
- Fixed a race where a late session-close event after a quick reset+prompt detached the new session (permission decisions went unanswered)

## 0.8.1
- Settings and Markdown reader are now floating windows: draggable by their title bar and non-blocking — keep using the cockpit while they're open
- Right-click context menu in the desktop app (copy selection, cut/paste in fields, select all) — e.g. copy just a portion of text from the Markdown reader

## 0.8.0
- Settings panel (⚙️ in the top bar): notifications, Telegram gateway, alternative provider (GLM), quick actions editor, engine hosts, UI language — no more hand-editing JSON files
- Telegram gateway hot-reload: saving settings restarts the bot immediately, no engine restart needed
- Secrets are masked in the UI (last 4 chars) and never sent back in clear unless changed
- `COCKPIT_DIR` / `COCKPIT_PORT` env overrides (isolated smoke-test instances)

## 0.7.0
- Open-source release: neutral defaults, English/Italian UI (auto-detected), docs, MIT license
- WSL user auto-detection on Windows

## 0.6.x
- Multi-instance tabs: N parallel sessions per project, per-tab busy state
- Resizable left sidebar; horizontal project strip on narrow layouts

## 0.5.x
- File explorer (drives, breadcrumb, context menu: rename/delete/new folder, open in OS explorer, open terminal here, ask Claude)
- Provider switch (Anthropic / custom `CLAUDE_CONFIG_DIR` endpoints) with cross-provider transcript carry-over
- Full chat noise filtering for resumed CLI sessions; accent scrollbars; collapsible side panel

## 0.4.x
- Telegram gateway: prompts, results, inline permission buttons, voice memos (Whisper STT)
- Full-text search across session transcripts
- Voice: dictation + spoken replies
- Integrated Markdown reader with clean-copy (plain text / raw md)
- Effort selector; collapsible MCP panel

## 0.3.x
- Session history browser with resume (like `claude -r`), category filters, topic search
- New chat, message queue, context usage indicator, image paste
- Browser access from the engine (multi-host bind), responsive mobile UI

## 0.2.0
- Session resume across restarts, desktop/phone notifications, cost/token counters, MCP status, thinking indicator

## 0.1.0
- Initial release: Electron app + WSL engine (Agent SDK), chat with tool cards and diffs, permission prompts, projects, quick actions, embedded terminal
