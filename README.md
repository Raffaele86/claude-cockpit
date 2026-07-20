# Claude Cockpit

A self-hosted desktop + mobile cockpit for [Claude Code](https://claude.com/claude-code). Pilot your Claude Code sessions from a clean chat UI, your phone's browser, or Telegram — with parallel sessions, permission buttons, voice input and a built-in file explorer.

> Unofficial project. Not affiliated with or endorsed by Anthropic. "Claude" is a trademark of Anthropic, PBC. You need your own Claude Code installation and subscription/API access.

## Download

Grab the [latest release](https://github.com/Raffaele86/claude-cockpit/releases/latest):

- **Windows** — `ClaudeCockpit-setup-<version>.exe` (installer, **auto-updates** from GitHub Releases) or `ClaudeCockpit-portable-<version>.exe` (single file, notifies you when a new version is out)
- **macOS** — `ClaudeCockpit-mac-{arm64,x64}-<version>.zip` (unsigned: first launch is right-click → Open; full walkthrough in [docs/install-macos.md](docs/install-macos.md))

The app is the shell — the engine must run where your `claude` CLI lives (see [Quickstart](#quickstart)); in a browser you can skip the app entirely.

## Features

- **Native CLI as the main view** — the real Claude Code TUI in a persistent per-tab terminal (survives reloads); toggle to a chat-style view per tab
- **Chat UI for Claude Code** — streaming markdown, tool cards with diffs, todo panel, thinking blocks, cost/context indicators (default on mobile)
- **Permission prompts as buttons** — allow once / always / deny / edit input, from the app or from Telegram
- **Multi-session tabs** — run N parallel Claude sessions per project, plus unlimited projects
- **Session history** — browse and resume past conversations (like `claude -r`), with category filters and full-text search inside transcripts
- **Telegram gateway** — chat with your agent from anywhere, approve permissions inline, send voice memos (auto-transcribed via Whisper)
- **Mobile browser access** — the engine serves the UI over HTTP; open it from your phone (e.g. via Tailscale), fully responsive
- **File explorer** — navigate local drives, mark folders as projects, context menu (rename, delete, open terminal here, ask Claude about a file), integrated Markdown reader with clean-copy
- **Voice** — dictation via server-side Whisper (Groq/OpenAI key, same as Telegram voice memos): works in the desktop app, in the CLI view (text typed into the terminal) and on mobile over https; spoken replies (TTS) in chat view
- **Multi-provider** — switch between Anthropic, any Claude-Code-compatible endpoint (e.g. GLM via `CLAUDE_CONFIG_DIR`) or every OpenRouter model through a local bridge, keeping the conversation; live searchable model catalog (see [docs/providers.md](docs/providers.md))
- **File checkpoints** — 📸 snapshot the project files before a risky task and restore any snapshot in one click (automatic pre-restore safety copy, last 5 kept per project)
- **Transcript export** — download the current chat as a Markdown file (the CLI view has Claude Code's native `/export`)
- **Auto-update** — Windows installs update themselves from GitHub Releases; portable and macOS builds show a notice with a download link when a new version is out
- **Images** — paste screenshots straight into the composer
- **Settings panel** — configure everything (Telegram, notifications, providers, quick actions, engine hosts, language) from the ⚙️ menu; the Telegram bot hot-reloads on save

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
git clone https://github.com/Raffaele86/claude-cockpit
cd claude-cockpit/engine && npm install && npm run build
cd ../app && npm install && npm run build:renderer
cp -r dist ../engine/ui        # let the engine serve the UI
cd ../engine && npm start      # ws+http on 127.0.0.1:8130
```

Open `http://127.0.0.1:8130/?token=$(cat ~/.claude-cockpit/token)` in a browser — or build the desktop app with `cd app && npm run dist:win` (see below).

Run the engine as a service: `scripts/install-engine-service.sh` (Linux/WSL, systemd) or `scripts/install-engine-macos.sh` (macOS, launchd) — see [docs/install-macos.md](docs/install-macos.md) for the full macOS walkthrough.

**Is my machine ready?** The app ships with a built-in **System check** (🩺 in the top bar; it also opens automatically when the engine can't be reached): it verifies WSL (on Windows), Node ≥ 20, the Claude Code CLI, the engine service, the port and the update channel, with a fix hint for every red item.

## Configuration (`~/.claude-cockpit/`)

Everything below is editable from the **⚙️ Settings panel** in the top bar — the files are the storage, not the interface. Secrets are shown masked and are only overwritten when you type a new value.

| File | Purpose |
|------|---------|
| `token` | auto-generated bearer token for the WS/HTTP UI |
| `projects.json`, `quickactions.json` | sidebar projects and quick action buttons |
| `engine.json` | `{ "hosts": ["127.0.0.1", "<tailscale-ip>"] }` — extra bind addresses for phone access |
| `telegram.json` | Telegram gateway — see [docs/telegram.md](docs/telegram.md) |
| `providers.json` | alternative providers — see [docs/providers.md](docs/providers.md) |
| `config.json` | desktop notifications, optional [ntfy](https://ntfy.sh) topic for phone push |

## MCP servers

Cockpit ships with **no MCP servers** and never connects to anything preconfigured: sessions inherit the MCP configuration of *your* Claude Code install (`settingSources: user/project/local`). The side panel (☰) shows their status, and lets you **connect your own**: ＋ opens a form (HTTP / SSE / stdio command, optional headers or env vars, scope "all projects" or "this project") that wraps `claude mcp add`; ✕ removes one. The session restarts to load the change — the conversation is kept.

**Migrating to another machine**: MCP panel → **Export** downloads your user-scope servers as a JSON file; **Import** on the new machine adds them all (via `claude mcp add-json`). The file can contain access tokens — treat it like a password.

## Security notes

- The engine binds to `127.0.0.1` only, by default. Adding other hosts (LAN/VPN IPs) is opt-in via `engine.json`; the WS is protected by the bearer token, but traffic is plain `ws://` — only expose it on networks you trust (a VPN like Tailscale is the intended path).
- **HTTPS for mobile (recommended)**: browsers block the microphone (dictation) on plain-http origins. If you use Tailscale, one command puts a valid TLS cert in front of the engine: `tailscale serve --bg http://127.0.0.1:8130` → open `https://<machine>.<tailnet>.ts.net/#token=…` on your phone. WebSocket is proxied too (the UI auto-switches to `wss://`), and the config persists across reboots.
- The Telegram gateway answers a single configured chat id and ignores everyone else.
- Deleting folders from the file explorer only works on empty ones by design.

## Building the desktop app

From WSL/Linux (Windows cross-build needs wine64 + wine32:i386 for the NSIS installer):

```bash
cd app && npm run dist:win   # → app/dist-win/ClaudeCockpit-{portable,setup}-<version>.exe
cd app && npm run dist:mac   # → app/dist-win/ClaudeCockpit-mac-{arm64,x64}-<version>.zip (unsigned)
```

The macOS zips are unsigned: first launch is right-click → Open (see [docs/install-macos.md](docs/install-macos.md)).

## License

MIT — see [LICENSE](LICENSE).
