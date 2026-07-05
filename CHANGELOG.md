# Changelog

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
