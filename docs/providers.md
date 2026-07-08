# Alternative providers

Cockpit can run sessions against any endpoint that Claude Code itself supports, using the `CLAUDE_CONFIG_DIR` pattern: a separate Claude Code config directory whose `settings.json` points to a different base URL / auth token (e.g. Z.ai's GLM Coding Plan, or any Anthropic-compatible router).

## Setup

1. Create a dedicated config dir, e.g. `~/.claude-glm/settings.json`:
   ```json
   {
     "env": {
       "ANTHROPIC_AUTH_TOKEN": "<your key>",
       "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
       "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-5.2[1m]",
       "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-5.2[1m]",
       "ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-4.5-air",
       "ANTHROPIC_DEFAULT_FABLE_MODEL": "glm-5.2[1m]"
     }
   }
   ```
   Map **every** model alias Claude Code knows (opus/sonnet/haiku/fable): an unmapped alias sends the raw Anthropic model id to the gateway, which rejects it with `400 Unknown Model`.
2. Register it in `~/.claude-cockpit/providers.json`:
   ```json
   { "glm": { "configDir": "/home/you/.claude-glm", "model": "glm-5.2[1m]", "models": ["glm-5.2[1m]", "glm-4.5-air"] } }
   ```
   `models` feeds the model dropdown shown in the CLI toolbar and the chat top bar while GLM is active (also editable in Settings → Provider).
3. Restart the engine. A `Claude | GLM` toggle appears in the top bar.

You can register **any number** of providers — each key in `providers.json` becomes a chip in the top bar. Settings → Providers is a per-provider editor (add/remove rows), so you don't have to touch the file by hand.

## OpenRouter (all models, free ones included)

OpenRouter's *native* Anthropic endpoint only serves Anthropic models. To reach every OpenRouter model (Qwen, Llama, GPT-OSS, Nemotron, … including the `:free` ones) Claude Code needs a small local translator: **claude-code-router** (ccr), a headless proxy on `127.0.0.1:3456` that converts the Claude Code protocol to OpenRouter.

1. Install the headless line (pin the major — the 3.x line is a heavier SQLite/UI app):
   ```bash
   npm install -g @musistudio/claude-code-router@1
   ```
2. `~/.claude-code-router/config.json` (chmod 600) — put your real OpenRouter key (`sk-or-…`) in `api_key`, and a self-chosen local token in `APIKEY`:
   ```json
   {
     "PORT": 3456, "HOST": "127.0.0.1", "APIKEY": "<local-token-you-choose>",
     "Providers": [{
       "name": "openrouter",
       "api_base_url": "https://openrouter.ai/api/v1/chat/completions",
       "api_key": "sk-or-…",
       "models": ["qwen/qwen3-coder:free", "openai/gpt-oss-120b:free", "meta-llama/llama-3.3-70b-instruct:free"],
       "transformer": { "use": ["openrouter"] }
     }],
     "Router": { "default": "openrouter,qwen/qwen3-coder:free" }
   }
   ```
   Model ids change over time — list the current free ones with `curl -s https://openrouter.ai/api/v1/models | jq -r '.data[].id | select(endswith(":free"))'`.
3. Run ccr as a service so it's always up (v1 runs in the foreground, `Type=simple` is fine):
   ```ini
   # ~/.config/systemd/user/ccr-router.service   (macOS: a launchd agent running `ccr start`)
   [Service]
   ExecStart=/bin/bash -lc 'exec ccr start'
   Restart=always
   ```
   `systemctl --user enable --now ccr-router`.
4. A dedicated Claude config dir `~/.claude-openrouter/settings.json` points Claude Code at the proxy:
   ```json
   { "env": { "ANTHROPIC_BASE_URL": "http://127.0.0.1:3456", "ANTHROPIC_AUTH_TOKEN": "<the APIKEY above>", "API_TIMEOUT_MS": "3000000" } }
   ```
   Also set `projects["<your cwd>"].hasTrustDialogAccepted: true` in `~/.claude-openrouter/.claude.json` (skips the folder-trust prompt).
5. Register it in `~/.claude-cockpit/providers.json`. Instead of a static list, use a **live catalog** so the model dropdown always reflects OpenRouter's current offering (300+ models, free ones first, searchable):
   ```json
   { "openrouter": {
       "configDir": "/home/you/.claude-openrouter",
       "model": "openrouter,qwen/qwen3-coder:free",
       "modelsUrl": "https://openrouter.ai/api/v1/models",
       "modelPrefix": "openrouter,"
   } }
   ```
   `modelsUrl` = an OpenRouter-style `/models` endpoint (`{ data: [{ id, name, pricing }] }`); `modelPrefix` is prepended to each id (ccr wants `openrouter,<id>`). The engine caches the catalog for 5 minutes. Omit both and set a static `models: [...]` array if you prefer a fixed short list.
6. Restart the engine → an `Openrouter` chip appears; selecting it fetches the live list into a searchable dropdown (type to filter, `free` badge on the free models).

## How switching works

Switching providers restarts the project's session with the new config dir. Session transcripts live inside each provider's config dir, so the engine **copies the current transcript across** on switch — your conversation continues where it left off.
