# Installing Claude Cockpit on macOS

Cockpit has two parts: the **engine** (a small Node service that runs Claude Code on your machine) and the **app** (an Electron window; you can also just use a browser).

> ⚠️ Built and tested primarily on Windows/WSL. The macOS path uses the same engine code running natively (no WSL involved); the install script below has not been exercised on every macOS version — if something misbehaves, the in-app **System check** (🩺) tells you which prerequisite is missing.

## Prerequisites

1. **Node.js ≥ 20** — `brew install node` or [nodejs.org](https://nodejs.org)
2. **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`, then run `claude` once in a terminal and complete the login.

## Engine

```bash
git clone https://github.com/Raffaele86/claude-cockpit.git
cd claude-cockpit
bash scripts/install-engine-macos.sh
```

The script builds the engine and installs a launchd user agent (`com.claude-cockpit.engine`) that starts at login and restarts on crash. Logs: `~/Library/Logs/claude-cockpit-engine.log`.

## App

Download `ClaudeCockpit-mac-arm64-<version>.zip` (Apple Silicon) or `ClaudeCockpit-mac-x64-<version>.zip` (Intel) from the Releases page, unzip, and move `Claude Cockpit.app` to Applications.

The app is **not code-signed**: the first time, right-click → **Open** (or run `xattr -cr "/Applications/Claude Cockpit.app"`), otherwise macOS reports it as damaged.

No app? The engine also serves the full UI in a browser: `http://127.0.0.1:8130/?token=<token>` — the token is in `~/.claude-cockpit/token`.

## First run

- The app connects to the engine on `127.0.0.1:8130`. If it can't, the **System check** window opens automatically and verifies Node, the Claude CLI, the engine service and the port, with a fix hint for each red item.
- MCP servers can be migrated from another machine: on the old one, MCP panel → **Export** (downloads a JSON); on the Mac, MCP panel → **Import**. Mind that the file may contain access tokens — treat it like a password.

## Updating

```bash
cd claude-cockpit && git pull && bash scripts/install-engine-macos.sh
```
