# Changelog

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
