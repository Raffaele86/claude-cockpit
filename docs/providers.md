# Alternative providers

Cockpit can run sessions against any endpoint that Claude Code itself supports, using the `CLAUDE_CONFIG_DIR` pattern: a separate Claude Code config directory whose `settings.json` points to a different base URL / auth token (e.g. Z.ai's GLM Coding Plan, or any Anthropic-compatible router).

## Setup

1. Create a dedicated config dir, e.g. `~/.claude-glm/settings.json`:
   ```json
   {
     "env": {
       "ANTHROPIC_AUTH_TOKEN": "<your key>",
       "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
       "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-5.2",
       "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-5.2"
     }
   }
   ```
2. Register it in `~/.claude-cockpit/providers.json`:
   ```json
   { "glm": { "configDir": "/home/you/.claude-glm", "model": "glm-5.2" } }
   ```
3. Restart the engine. A `Claude | GLM` toggle appears in the top bar.

## How switching works

Switching providers restarts the project's session with the new config dir. Session transcripts live inside each provider's config dir, so the engine **copies the current transcript across** on switch — your conversation continues where it left off.
