# Changelog

## 0.29.2
- Fix: a failed Windows agent spawn (bad `claude.exe`/`powershell` path) used to leave a blank, stuck terminal with a leaked channel — the agent now reports the error and exits, the bridge renders agent errors in the terminal, and a 15s spawn watchdog closes the channel if neither `ready` nor `exit` arrives
- Fix: killing a Windows tab now also exits the agent process explicitly, so the native Windows process isn't orphaned
- Fix: the busy indicator no longer switches off after ~2s on native Windows tabs (the idle tick ignored `:win` channels)
- The command palette view command now cycles CLI → Win → Chat, matching the three-way toggle introduced in 0.29.1
- Engine version is now read from `engine/package.json` (single source of truth) instead of a hardcoded constant

## 0.29.1
- The Windows terminal is now a third view toggle (**CLI / Win / Chat**) next to the others — switch the current tab between the WSL terminal, native Windows claude, and chat from one place, no separate window or dedicated tab. Replaces the earlier "New Windows tab" command

## 0.29.0
- **New Windows tab (native claude)**: a cockpit CLI tab can now run `claude` in a real Windows ConPTY instead of WSL, embedded like any other tab — so it drives the real Windows Chrome. A small Windows agent (`engine/win-agent`, node-pty prebuilt) owns the ConPTY and bridges terminal bytes over stdio to the engine (the WSL node-pty can't host a Windows console). Sessions live in the Windows `~/.claude`, so they don't appear in the cockpit history
- **Open on Windows**: menu/palette action that opens a native PowerShell window in the project directory with `claude` started — the separate-window alternative to the embedded tab. No MCP/CDP setup
- **Native Windows builds**: the installer/portable now build natively on Windows via PowerShell (`build-win.ps1`) instead of electron-builder-in-WSL, dropping the wine dependency; the WSL script stages the app to a local Windows path and drives electron-builder there
- **Security hardening**: markdown is sanitized with DOMPurify before rendering (closes an output→innerHTML→token-theft XSS); the WebSocket upgrade checks `Origin`; settings and bind reject wildcard hosts (`0.0.0.0`); the browser UI gets a CSP; Electron gains `sandbox: true`, denies external navigation/`window.open`, validates `openExternal`, and whitelists config keys; a cleartext-network warning prints at startup

## 0.28.4
- Fix: scrolling long model lists (NVIDIA catalog) no longer snaps back — an effect re-ran on every render (options array identity) and kept re-scrolling to the selected entry; it now runs only when the dropdown opens. Same guard applied to the command palette list
- Session popover widened to 400px so four provider chips fit on one line

## 0.28.3
- **Authenticated live model catalogs**: providers gain an optional `modelsKey` — the engine sends it as a Bearer token when fetching `modelsUrl`, enabling live catalogs from providers that require auth (e.g. NVIDIA NIM's 121-model list). The key is masked in the Settings snapshot and preserved across Settings saves, same treatment as the Telegram token; `providers.json` is written with mode 0600
- Session popover: the provider segmented control wraps instead of overflowing the panel with 4+ providers; the model dropdown shows catalog labels; the top-bar pill shows the model name without the provider prefix

## 0.28.2
- Fix: the session popover no longer closes while you pick values — it stays open through provider/model/effort/permission changes and closes only on outside click, Esc or the new ✕ (it used to auto-close on provider/permission changes in the CLI view, which read as "closes on every click")
- **Model search is back**: the model dropdown gains a filter box on long lists (OpenRouter catalog) — same search that ModelCombo had before the redesign
- Popovers explicitly opt out of the Electron drag region

## 0.28.1
- **Session popover**: clicking the top-bar session pill now opens an anchored panel with provider, model, effort and permission controls — one click away again (they had moved into the command palette in 0.28.0). Stays open while you adjust multiple values; provider/permission changes in the CLI view close it because the terminal relaunches. The palette submenus still work for keyboard-first flow

## 0.28.0
- **Command palette (Ctrl/⌘+K)**: Raycast-style palette covering everything — new chat/tab, history, export, project switching, provider/model/effort/permission submenus, every panel, quick actions and preferences. Works from the CLI view too (captures the shortcut before the terminal); a ⌘K button in the top bar opens it on touch devices
- **Minimal top bar**: down from 17 controls to 5 — brand, a session pill showing the current model · effort (click → palette), New chat, inbox with badge, and a ⋯ menu for the rare toggles (TTS, notifications, panels). Model/provider/effort selectors, Plan/Bypass and the panel buttons all moved into the palette and menu; cost/ctx live in the statusline
- **Design tokens**: one warm layered palette (deeper app background, surface, elevated), a fixed 5-step type scale and 4-step radius scale replacing 14 ad-hoc font sizes and 13 radii, 3 text levels, 2 shadow levels — the whole theme now reads as one system
- **Custom selects**: native `<select>` dropdowns replaced by a themed popover component (keyboard navigation included) in Usage, MCP and Settings panels
- Polish: composer textarea auto-grows from one line, focus ring on the composer is accent-tinted, quick actions are pills, shared pop-in animation for popovers, `prefers-reduced-motion` respected

## 0.27.0
- **Custom project icons**: sidebar projects can now use the app's stroke icon set with a per-project accent color — the add/edit form in the rail gains an icon grid + 8 color swatches, and every project row gets a pencil (on hover) to restyle it. Legacy emoji icons in `projects.json` keep rendering as before (no migration needed); Telegram's project menu falls back to 📁 for icon names it can't render
- **Modern button system**: buttons are ghost by default (no grey borders — subtle hover, accent-tinted active state) with a single filled accent style reserved for primary actions; mutually exclusive groups (provider, Plan/Bypass, CLI|Chat, drive filters) become pill segmented controls; keyboard focus gets a visible accent ring everywhere
- **Unified floating panels**: new `FloatPanel` shell shared by Settings, Markdown reader, Checkpoints, Usage, Inbox and System check — same 40px header (icon + title + close), radius, shadow and open animation, all draggable, staggered opening positions preserved. The permission prompt keeps its centered-modal role but adopts the same visual language (Allow is the only filled button, Deny is ghost red)
- Cleanup: last textual emoji removed from UI strings (import confirmations, checkpoint hint)

## 0.26.0
- **Custom SVG icon set**: every emoji in the app chrome (top bar, panels, composer, tabs, file navigator, context menus, chat markers) is replaced by a hand-drawn stroke icon set — consistent across OSes, inherits the theme color (finally readable on dark), zero dependencies. Project icons in the sidebar stay emoji: they're your data
- **Fix: CLI toolbar model out of sync**: the model selector used to show whatever you last picked, not what the session actually runs (statusline). The engine now reports the real model (last one used in the session transcript, or the spawn `--model`) on every attach; when unknown the selector shows the placeholder instead of a stale value. It re-syncs on tab switch/reload, not live mid-conversation

## 0.25.0
- **Per-project quick actions**: each quick action can now be scoped to a single project (new selector in Settings → Quick actions, default "global") — project-specific shortcuts appear only where they belong
- **Rename & pin tabs**: double-click a tab title to rename it (local override of the AI title, persisted); 📌 on the active tab pins it to the first position. Renames also show in the inbox
- **Model dimension in the usage dashboard**: 📊 gains a model filter (fed by `message.model` from the transcripts) — see how many tokens each model burned, e.g. paid Anthropic vs free OpenRouter routes. Recorded $ costs have no model attached and are excluded while the filter is active

## 0.24.1
- Fix: the Checkpoints/Usage/Inbox/System-check panels had a transparent background (the backdrop came from a class they didn't use) and all opened stacked dead-center. Panels now have their own solid background and bar styling, and each opens at a slightly different position so they don't pile up

## 0.24.0
- **Operational inbox**: each 📥 row now shows a 🔐 icon when that session is waiting for a permission decision (rows with pending permissions float to the top) and gets a ⏹ stop button while working — interrupt any session without leaving the panel. Also fixed: permission prompts raised by secondary tabs now surface correctly when you switch to that tab
- **1-click config backup**: Settings → Engine gains Export/Import for the whole `~/.claude-cockpit` configuration (providers, Telegram, quick actions, projects, notifications). Import is whitelisted server-side — the engine token and runtime state are never exported nor accepted. The backup contains secrets: treat it like a password
- **Global history search**: the History panel's full-text search gets a 🌐 toggle to search across ALL registered projects at once; results carry a project badge and clicking one jumps to that project and opens the session

## 0.23.0
- **Telegram `/project`**: the gateway is no longer pinned to one project — `/project` lists your sidebar projects as buttons, switching applies immediately (prompts, /status, result notifications) and persists across engine restarts
- **Session titles everywhere**: tabs show the session's real title (the same AI title you see in History) instead of "Chat 2", and the inbox rows show it too. Works for CLI tabs as well (the engine now reports which session each terminal owns)
- **Drag & drop in the composer**: drop screenshots/images to attach them (same pipeline as paste) and drop text files (.md .txt .log .json .csv, max 100 kB) to quote their content in the message; drop target highlights while dragging

## 0.22.0
- **CLI tabs in the inbox**: the engine now tracks pty output and broadcasts a working/idle state (recent output = working, 3s idle window) — CLI tabs finally show up in the 📥 inbox, in the badge count, and get busy dots on tabs and in the project rail
- **Panels are phone-friendly**: every floating window (Settings, System check, Checkpoints, Usage, Inbox) goes full-screen on small screens with a scrollable body, like the Markdown reader already did
- **Usage by origin**: the 📊 dashboard classifies every session as cockpit / cli / scheduler / tech (detected from the transcripts during the same scan) with a third filter — see at a glance how much your schedulers burn vs interactive work

## 0.21.0
- **Automatic file checkpoints** (opt-in, Settings → Engine): with the toggle on, the engine snapshots the project files before every chat prompt (at most one every 10 minutes) — if a task goes wrong, the rewind is always there in the 📸 panel
- **Usage dashboard** (📊): tokens per day/provider/project over the last 30 days, read from the real session transcripts of every configured provider. Dollar costs are shown only where the engine recorded them at task end (recording starts with this release — no per-model price estimates). First open scans the transcripts and can take a few seconds; later opens use an incremental cache
- **Richer task-done notifications**: desktop/ntfy notifications now include cost, turn count and the files edited (up to 3 + count); Telegram adds cost and turns to the result message
- **Sessions inbox** (📥): one panel listing every open chat session across projects and tabs — busy state, last reply snippet, cumulative cost; click a row to jump there. The button badge counts the sessions currently working. CLI tabs are not tracked (their prompts don't go through the engine)

## 0.20.0
- **Export transcript**: new button in the Chat view downloads the current conversation as a Markdown file (user/assistant text, tools compacted to one line; in the CLI view use the native `/export`)
- **File checkpoints**: new 📸 panel snapshots the project files (tar.gz, node_modules/.git/build dirs excluded) and restores any snapshot with one click. A `pre-restore` safety snapshot is taken before every restore; the engine keeps the last 5 per project. Restoring brings files back to the snapshot state but does not delete files created afterwards
- **System check knows about updates**: a new "Updates" row verifies the GitHub release channel is reachable and tells whether you're up to date or a newer version exists
- **Smaller, split bundle**: the renderer is now code-split (react/xterm/marked vendor chunks + on-demand Settings and Doctor) — main chunk down from 561 kB to 84 kB, and differential updates get smaller when only app code changes

## 0.19.0
- **Auto-update** (Windows installer): the app checks GitHub Releases on startup via electron-updater, downloads new versions in the background and offers to restart when ready. Update errors are logged and never block startup
- **Update notice** (portable & macOS builds): these builds can't update themselves (portable by nature, mac zips are unsigned), so on startup they compare their version with the latest GitHub release and, if newer, offer to open the download page
- Releases now ship `latest.yml` + blockmap next to the installers so the updater has a feed to read

## 0.18.0
- **Dynamic providers**: the provider chips (Claude / GLM / …) and the model selector are now built from `providers.json`, not hardcoded. Add any number of alternative providers; each gets its config dir, default model and selector model list. Settings → Providers is a per-provider editor (add/remove rows)
- **OpenRouter support** (all models, free included) via a local claude-code-router bridge: docs/providers.md has the full recipe (ccr on 127.0.0.1:3456 translating Claude Code ↔ OpenRouter). The native OpenRouter Anthropic endpoint only serves Anthropic models, hence the bridge
- **Live model catalog with search**: a provider can set `modelsUrl` (OpenRouter-style `/models`); selecting it fetches the full up-to-date model list (free ones first, marked) into a searchable dropdown — type to filter among hundreds of models. Cached 5 min engine-side

## 0.17.0
- Built-in **System check** (doctor): stethoscope button in the top bar, opens automatically when the engine can't be reached. Verifies WSL (Windows), Node >= 20, the Claude Code CLI, the engine service and port 8130 — with a fix hint for every failing item. In the browser it lists the requirements (checks need the desktop app)
- **MCP export/import**: MCP panel gains Export (downloads your user-scope servers as JSON) and Import (adds them on another machine via `claude mcp add-json`). The exported file may contain tokens — treat it like a password
- **macOS support**: `npm run dist:mac` builds unsigned arm64/x64 zips; new `scripts/install-engine-macos.sh` installs the engine as a launchd agent; full walkthrough in docs/install-macos.md

## 0.16.4
- CLI controls (provider, model, effort, Plan/Bypass, New chat, History) moved into the top bar — same placement as the Chat view; the tabs row now holds only tabs + the CLI|Chat toggle

## 0.16.3
- Closing a tab right after opening it no longer flashes a "models_list: Query closed before response received" error banner: a request aborted by an intentional session close is an expected outcome, not an error

## 0.16.2
- Tabs get their own full-width row; the CLI toolbar (provider/model/effort/mode/New chat/History) and the CLI|Chat toggle move to a second row below — more room to keep many chats open

## 0.16.1
- Switching tabs no longer restarts a chat's CLI: the toolbar relaunch flags were re-sent on every terminal re-mount (any tab switch back), killing the running process each time. Launch flags are now one-shot — tab switches are pure detach/attach, VS Code style

## 0.16.0
- Deterministic per-tab sessions: every CLI pty is spawned with an engine-assigned `--session-id`; relaunches (provider/mode switch) resume EXACTLY that id (`--resume`, copying the jsonl across stores on provider switch). `-c` and mtime heuristics are gone — they grabbed conversations belonging to OTHER processes running in the same cwd (schedulers, bots, external terminals), which could even end with two claude processes writing the same session file and freezing a chat

## 0.15.3
- Every chat is now truly independent: "New chat" opens a NEW tab with a fresh CLI session (it no longer /clear-ed the current conversation); tab ids are unique forever (a recycled id could re-attach to a closed tab's terminal); closing a tab also kills its terminal processes (new op `pty_kill_project`)

## 0.15.2
- GLM launches always pass an explicit `--model` (the provider default from providers.json, or the one picked in the toolbar): the CLI flag overrides a `model` set in the project's `.claude/settings.json` — with cwd = home that file IS the main Claude config, whose Anthropic model id leaked into GLM sessions as API 400 Unknown Model

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
