# Telegram gateway

Chat with your Cockpit from Telegram: every message becomes a prompt, results come back as messages, permission requests arrive with inline buttons (✅ once / ♾ always / ❌ deny), and voice memos are transcribed automatically.

## Setup

The easy way: open **⚙️ Settings → Telegram** in the app and fill in the fields — the gateway starts immediately on save, no restart needed. Steps 1–3 below still apply to get the values; steps 4–5 are the manual (file-based) alternative.

1. **Create a bot**: talk to [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token. Recommended: `/setjoingroups` → Disable.
2. **Get your chat id**: send any message to your new bot, then:
   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates" | python3 -c "import sys,json; [print(u['message']['chat']['id']) for u in json.load(sys.stdin)['result'] if 'message' in u]"
   ```
3. **(Optional) speech-to-text** for voice memos: get a free API key from [Groq](https://console.groq.com) (Whisper) or use OpenAI.
4. **Write the config** `~/.claude-cockpit/telegram.json`:
   ```json
   {
     "botToken": "123456:ABC...",
     "chatId": 123456789,
     "project": "/home/you/myproject",
     "sttApiKey": "gsk_...",
     "sttProvider": "groq"
   }
   ```
   `chatId` is a number. Omit `sttApiKey` to disable voice. `chmod 600` the file.
5. **Restart the engine**. The log should show `gateway Telegram attivo`.

## Commands

| Command | Effect |
|---------|--------|
| any text | prompt to Claude on the configured project |
| voice memo | transcribed, then sent as a prompt |
| `/stop` | interrupt the current turn |
| `/nuova` | start a new conversation (session reset) |
| `/status` | project, busy state |

## Security

Only the configured `chatId` is served; all other senders are ignored (and logged). The gateway maps to the project's **main** session — the same one you see in the app.

Tip: if the bot received messages *before* you enabled the gateway, drain them first or they will be processed as prompts:
```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates?offset=<last_update_id+1>"
```
