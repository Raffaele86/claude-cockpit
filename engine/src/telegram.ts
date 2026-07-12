// Gateway Telegram: chatta col Cockpit da Telegram (testo + memo vocali),
// permessi con bottoni inline, notifiche risultato. Config in ~/.claude-cockpit/telegram.json;
// file assente = gateway spento. Solo il chatId configurato è autorizzato.
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { COCKPIT_DIR } from './auth.js';
import { transcribeAudio } from './stt.js';
import type { ProjectEntry, ServerMsg } from './protocol.js';

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
  /** Registra un listener sugli eventi broadcast dell'engine; ritorna la funzione di unsubscribe. */
  subscribe: (fn: (msg: ServerMsg) => void) => () => void;
  /** Registry progetti della sidebar (per /project). */
  listProjects: () => ProjectEntry[];
}

/** Handle del gateway: stop() ferma polling e listener (per l'hot-reload da impostazioni). */
export interface TelegramGateway {
  stop: () => void;
}

function loadConfig(): TelegramConfig | null {
  try {
    const cfg = JSON.parse(readFileSync(join(COCKPIT_DIR, 'telegram.json'), 'utf8')) as TelegramConfig;
    if (!cfg.botToken || !cfg.chatId) return null;
    return cfg;
  } catch {
    return null;
  }
}

export function startTelegramGateway(deps: GatewayDeps): TelegramGateway | null {
  const cfg = loadConfig();
  if (!cfg) return null;
  const api = `https://api.telegram.org/bot${cfg.botToken}`;
  let project = cfg.project ?? homedir(); // cambia a runtime con /project
  let projectMenu: ProjectEntry[] = []; // lista mostrata dall'ultimo /project (i callback usano l'indice)

  // Persisti il progetto scelto (il file contiene segreti → mode 0600, merge non distruttivo).
  function persistProject(path: string): void {
    try {
      const raw = JSON.parse(readFileSync(join(COCKPIT_DIR, 'telegram.json'), 'utf8')) as Record<string, unknown>;
      raw.project = path;
      writeFileSync(join(COCKPIT_DIR, 'telegram.json'), JSON.stringify(raw, null, 2) + '\n', { mode: 0o600 });
    } catch (err) {
      console.error('[telegram] persistenza progetto fallita:', String(err));
    }
  }

  async function call(method: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const res = await fetch(`${api}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
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
    const info = (await call('getFile', { file_id: fileId })) as { file_path?: string } | undefined;
    if (!info?.file_path) return null;
    const audio = await fetch(`https://api.telegram.org/file/bot${cfg!.botToken}/${info.file_path}`);
    const buf = Buffer.from(await audio.arrayBuffer());
    try {
      // Stessa pipeline (e stessa lingua configurata) della dettatura UI.
      return await transcribeAudio(buf.toString('base64'), 'audio/ogg');
    } catch (err) {
      console.error('[telegram] STT:', String(err));
      return null;
    }
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
    } else if (text === '/project') {
      projectMenu = deps.listProjects();
      if (!projectMenu.length) {
        sendText('Nessun progetto nel registry.');
      } else {
        // callback_data max 64 byte → indice nella lista appena mostrata, mai il path.
        // I nomi-icona del set UI (es. 'home') non sono renderizzabili in Telegram → 📁 generico.
        const rows = projectMenu.map((p, i) => {
          const em = p.icon && /\p{Extended_Pictographic}/u.test(p.icon) ? p.icon : '📁';
          return [{ text: `${em} ${p.name}${p.path === project ? ' ✓' : ''}`, callback_data: `proj|${i}` }];
        });
        sendText('Scegli il progetto attivo:', { reply_markup: { inline_keyboard: rows } });
      }
    } else if (text === '/start') {
      sendText(`Cockpit pronto su ${project}. Scrivi (o manda un vocale) e rispondo. Comandi: /stop /nuova /status /project`);
    } else {
      deps.prompt(project, text);
    }
  }

  async function handleCallback(cb: { id: string; from: { id: number }; data?: string }): Promise<void> {
    if (cb.from.id !== cfg!.chatId || !cb.data) return;
    const [kind, arg] = cb.data.split('|');
    if (kind === 'proj') {
      const entry = projectMenu[Number(arg)];
      if (entry) {
        project = entry.path;
        persistProject(entry.path);
        sendText(`📁 Progetto attivo: ${entry.name} (${entry.path})`);
      }
      await call('answerCallbackQuery', { callback_query_id: cb.id, text: entry ? entry.name : 'Lista scaduta, rifai /project' });
      return;
    }
    const decision = kind as 'allow-once' | 'allow-always' | 'deny';
    const ok = deps.decidePermission(arg, decision);
    await call('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: ok ? (decision === 'deny' ? 'Negato' : 'Consentito') : 'Richiesta scaduta',
    });
  }

  // Eventi engine → Telegram (solo per il progetto del gateway).
  const unsubscribe = deps.subscribe((msg) => {
    if (!('project' in msg) || msg.project !== project) return;
    if (msg.ev === 'result') {
      sendText(
        msg.is_error
          ? `⚠️ errore: ${msg.subtype}`
          : `${msg.result ?? 'completato'}\n\n💰 $${(msg.cost_usd || 0).toFixed(2)} · ${msg.num_turns} turni`,
      );
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

  // Long polling — stop() interrompe il getUpdates in corso e chiude il loop (hot-reload).
  let offset = 0;
  let stopped = false;
  let polling: AbortController | null = null;
  (async () => {
    while (!stopped) {
      try {
        polling = new AbortController();
        const updates = (await call('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] }, polling.signal)) as
          | Array<{ update_id: number; message?: Parameters<typeof handleMessage>[0]; callback_query?: Parameters<typeof handleCallback>[0] }>
          | undefined;
        for (const u of updates ?? []) {
          offset = u.update_id + 1;
          if (u.message) await handleMessage(u.message);
          if (u.callback_query) await handleCallback(u.callback_query);
        }
      } catch (err) {
        if (stopped) break;
        console.error('[telegram] polling:', String(err));
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();

  console.log(`[engine] gateway Telegram attivo (chat ${cfg.chatId}, progetto ${project})`);
  return {
    stop() {
      stopped = true;
      unsubscribe();
      polling?.abort();
      console.log('[engine] gateway Telegram fermato');
    },
  };
}
