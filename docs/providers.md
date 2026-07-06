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

## How switching works

Switching providers restarts the project's session with the new config dir. Session transcripts live inside each provider's config dir, so the engine **copies the current transcript across** on switch — your conversation continues where it left off.
