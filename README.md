# Claude Cockpit

A self-hosted desktop + mobile cockpit for [Claude Code](https://claude.com/claude-code). Pilot your Claude Code sessions from a clean chat UI, your phone's browser, or Telegram — with parallel sessions, permission buttons, voice input and a built-in file explorer.

> Unofficial project. Not affiliated with or endorsed by Anthropic. "Claude" is a trademark of Anthropic, PBC. You need your own Claude Code installation and subscription/API access.

## Features

- **Chat UI for Claude Code** — streaming markdown, tool cards with diffs, todo panel, thinking blocks, cost/context indicators
- **Permission prompts as buttons** — allow once / always / deny / edit input, from the app or from Telegram
- **Multi-session tabs** — run N parallel Claude sessions per project, plus unlimited projects
- **Session history** — browse and resume past conversations (like `claude -r`), with category filters and full-text search inside transcripts
- **Telegram gateway** — chat with your agent from anywhere, approve permissions inline, send voice memos (auto-transcribed via Whisper)
- **Mobile browser access** — the engine serves the UI over HTTP; open it from your phone (e.g. via Tailscale), fully responsive
- **File explorer** — navigate local drives, mark folders as projects, context menu (rename, delete, open terminal here, ask Claude about a file), integrated Markdown reader with clean-copy
- **Voice** — dictation (Web Speech API) and spoken replies (TTS)
- **Multi-provider** — switch between Anthropic and any Claude-Code-compatible endpoint (e.g. GLM via `CLAUDE_CONFIG_DIR`), keeping the conversation
- **Images** — paste screenshots straight into the composer

## Architecture

```
┌────────────────────┐   WebSocket (token auth)   ┌──────────────────────────┐
│  Electron app      │ ─────────────────────────▶ │  Engine (Node + TS)      │
│  (Windows/mac/Linux)│                            │  @anthropic-ai/          │
│  — or any browser  │ ◀───────────────────────── │  claude-agent-sdk        │
└────────────────────┘      events / stream       │  one query() per session │
                                                  │  + Telegram gateway      │
                                                  └──────────────────────────┘
```

- **engine/** runs where your `claude` CLI runs (native Linux/macOS, or inside WSL on Windows). It owns the sessions, talks to the Agent SDK, serves the static UI on `127.0.0.1:8130` and exposes a token-authenticated WebSocket.
- **app/** is a thin Electron shell around the same UI (pure JS, no native deps — cross-buildable).

## Requirements

- [Claude Code](https://claude.com/claude-code) installed and logged in (`claude` working in your terminal)
- Node.js ≥ 20 where the engine runs
- Windows users: WSL2 (the engine lives in WSL, the app on Windows; localhost is shared via mirrored networking)

## Quickstart

```bash
git clone https://github.com/<you>/claude-cockpit
cd claude-cockpit/engine && npm install && npm run build
cd ../app && npm install && npm run build:renderer
cp -r dist ../engine/ui        # let the engine serve the UI
cd ../engine && npm start      # ws+http on 127.0.0.1:8130
```

Open `http://127.0.0.1:8130/?token=$(cat ~/.claude-cockpit/token)` in a browser — or build the desktop app with `cd app && npm run dist:win` (see below).

Run the engine as a service (Linux/WSL systemd): `scripts/install-engine-service.sh`. On macOS use a LaunchAgent that runs `node engine/dist/server.js`.

## Configuration (`~/.claude-cockpit/`)

| File | Purpose |
|------|---------|
| `token` | auto-generated bearer token for the WS/HTTP UI |
| `projects.json`, `quickactions.json` | sidebar projects and quick action buttons |
| `engine.json` | `{ "hosts": ["127.0.0.1", "<tailscale-ip>"] }` — extra bind addresses for phone access |
| `telegram.json` | Telegram gateway — see [docs/telegram.md](docs/telegram.md) |
| `providers.json` | alternative providers — see [docs/providers.md](docs/providers.md) |
| `config.json` | desktop notifications, optional [ntfy](https://ntfy.sh) topic for phone push |

## Security notes

- The engine binds to `127.0.0.1` only, by default. Adding other hosts (LAN/VPN IPs) is opt-in via `engine.json`; the WS is protected by the bearer token, but traffic is plain `ws://` — only expose it on networks you trust (a VPN like Tailscale is the intended path).
- The Telegram gateway answers a single configured chat id and ignores everyone else.
- Deleting folders from the file explorer only works on empty ones by design.

## Building the Windows app

From WSL (cross-build, needs wine64 + wine32:i386 for the NSIS installer):

```bash
cd app && npm run dist:win   # → app/dist-win/ClaudeCockpit-{portable,setup}-<version>.exe
```

## License

MIT — see [LICENSE](LICENSE).
