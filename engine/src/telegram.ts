// Gateway Telegram: chatta col Cockpit da Telegram (testo + memo vocali),
// permessi con bottoni inline, notifiche risultato. Config in ~/.claude-cockpit/telegram.json;
// file assente = gateway spento. Solo il chatId configurato è autorizzato.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ServerMsg } from './protocol.js';

interface TelegramConfig {
  botToken: string;
  chatId: number;
  project?: string;
  sttApiKey?: string;
  sttProvider?: 'groq' | 'openai';
}

export interface GatewayDeps {
  /** Invia un prompt sulla sessione del progetto. */
  prompt: (project: string, text: string) => void;
  interrupt: (project: string) => void;
  reset: (project: string) => void;
  status: (project: string) => { busy: boolean; model: string | null };
  decidePermission: (requestId: string, decision: 'allow-once' | 'allow-always' | 'deny') => boolean;
  /** Registra un listener sugli eventi broadcast dell'engine. */
  subscribe: (fn: (msg: ServerMsg) => void) => void;
}

function loadConfig(): TelegramConfig | null {
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), '.claude-cockpit', 'telegram.json'), 'utf8')) as TelegramConfig;
    if (!cfg.botToken || !cfg.chatId) return null;
    return cfg;
  } catch {
    return null;
  }
}

const STT_ENDPOINTS = {
  groq: 'https://api.groq.com/openai/v1/audio/transcriptions',
  openai: 'https://api.openai.com/v1/audio/transcriptions',
};
const STT_MODELS = { groq: 'whisper-large-v3', openai: 'whisper-1' };

export function startTelegramGateway(deps: GatewayDeps): boolean {
  const cfg = loadConfig();
  if (!cfg) return false;
  const api = `https://api.telegram.org/bot${cfg.botToken}`;
  const project = cfg.project ?? homedir();

  async function call(method: string, payload: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${api}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
    if (!data.ok) console.error(`[telegram] ${method}: ${data.description}`);
    return data.result;
  }

  function sendText(text: string, extra: Record<string, unknown> = {}): void {
    // Telegram limita a 4096 char per messaggio.
    for (let i = 0; i < text.length; i += 4000) {
      void call('sendMessage', { chat_id: cfg!.chatId, text: text.slice(i, i + 4000), ...extra });
    }
    if (text.length === 0) void call('sendMessage', { chat_id: cfg!.chatId, text: '(risposta vuota)', ...extra });
  }

  async function transcribe(fileId: string): Promise<string | null> {
    if (!cfg!.sttApiKey) return null;
    const provider = cfg!.sttProvider ?? 'groq';
    const info = (await call('getFile', { file_id: fileId })) as { file_path?: string } | undefined;
    if (!info?.file_path) return null;
    const audio = await fetch(`https://api.telegram.org/file/bot${cfg!.botToken}/${info.file_path}`);
    const blob = await audio.blob();
    const form = new FormData();
    form.append('file', blob, 'voice.ogg');
    form.append('model', STT_MODELS[provider]);
    form.append('language', 'it');
    const res = await fetch(STT_ENDPOINTS[provider], {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg!.sttApiKey}` },
      body: form,
    });
    if (!res.ok) {
      console.error(`[telegram] STT ${provider}: HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { text?: string };
    return data.text?.trim() || null;
  }

  async function handleMessage(msg: {
    chat: { id: number };
    text?: string;
    voice?: { file_id: string };
  }): Promise<void> {
    if (msg.chat.id !== cfg!.chatId) {
      console.log(`[telegram] messaggio da chat non autorizzata ${msg.chat.id}, ignorato`);
      return;
    }
    let text = msg.text?.trim() ?? '';
    if (msg.voice) {
      const t = await transcribe(msg.voice.file_id);
      if (!t) {
        sendText(cfg!.sttApiKey ? 'Trascrizione fallita, riprova.' : 'STT non configurato: aggiungi sttApiKey in telegram.json.');
        return;
      }
      sendText(`🎙 trascritto: ${t}`);
      text = t;
    }
    if (!text) return;
    if (text === '/stop') {
      deps.interrupt(project);
      sendText('⏹ Interrotto.');
    } else if (text === '/nuova') {
      deps.reset(project);
      sendText('🆕 Nuova conversazione avviata.');
    } else if (text === '/status') {
      const s = deps.status(project);
      sendText(`Progetto: ${project}\nStato: ${s.busy ? '⏳ al lavoro' : '✅ libero'}\nModello: ${s.model ?? 'default'}`);
    } else if (text === '/start') {
      sendText(`Cockpit pronto su ${project}. Scrivi (o manda un vocale) e rispondo. Comandi: /stop /nuova /status`);
    } else {
      deps.prompt(project, text);
    }
  }

  async function handleCallback(cb: { id: string; from: { id: number }; data?: string }): Promise<void> {
    if (cb.from.id !== cfg!.chatId || !cb.data) return;
    const [decision, requestId] = cb.data.split('|') as ['allow-once' | 'allow-always' | 'deny', string];
    const ok = deps.decidePermission(requestId, decision);
    await call('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: ok ? (decision === 'deny' ? 'Negato' : 'Consentito') : 'Richiesta scaduta',
    });
  }

  // Eventi engine → Telegram (solo per il progetto del gateway).
  deps.subscribe((msg) => {
    if (!('project' in msg) || msg.project !== project) return;
    if (msg.ev === 'result') {
      sendText(msg.is_error ? `⚠️ errore: ${msg.subtype}` : (msg.result ?? 'completato'));
    } else if (msg.ev === 'permission_request') {
      const input = JSON.stringify(msg.input ?? {}).slice(0, 500);
      sendText(`🔐 Permesso: ${msg.toolName}\n${input}`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Una volta', callback_data: `allow-once|${msg.requestId}` },
              { text: '♾ Sempre', callback_data: `allow-always|${msg.requestId}` },
              { text: '❌ Nega', callback_data: `deny|${msg.requestId}` },
            ],
          ],
        },
      });
    } else if (msg.ev === 'error') {
      sendText(`⚠️ ${msg.message}`);
    }
  });

  // Long polling.
  let offset = 0;
  (async () => {
    for (;;) {
      try {
        const updates = (await call('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] })) as
          | Array<{ update_id: number; message?: Parameters<typeof handleMessage>[0]; callback_query?: Parameters<typeof handleCallback>[0] }>
          | undefined;
        for (const u of updates ?? []) {
          offset = u.update_id + 1;
          if (u.message) await handleMessage(u.message);
          if (u.callback_query) await handleCallback(u.callback_query);
        }
      } catch (err) {
        console.error('[telegram] polling:', String(err));
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();

  console.log(`[engine] gateway Telegram attivo (chat ${cfg.chatId}, progetto ${project})`);
  return true;
}
