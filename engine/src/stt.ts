// Trascrizione vocale server-side (Whisper via Groq/OpenAI) — stessa config dei vocali
// Telegram: sttApiKey/sttProvider in COCKPIT_DIR/telegram.json.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COCKPIT_DIR } from './auth.js';

const ENDPOINTS = {
  groq: 'https://api.groq.com/openai/v1/audio/transcriptions',
  openai: 'https://api.openai.com/v1/audio/transcriptions',
};
const MODELS = { groq: 'whisper-large-v3', openai: 'whisper-1' };
const TIMEOUT_MS = 60_000;

export async function transcribeAudio(audioB64: string, mime: string): Promise<string> {
  let cfg: { sttApiKey?: string; sttProvider?: 'groq' | 'openai'; sttLanguage?: string };
  try {
    cfg = JSON.parse(readFileSync(join(COCKPIT_DIR, 'telegram.json'), 'utf8'));
  } catch {
    cfg = {};
  }
  if (!cfg.sttApiKey) throw new Error('STT non configurato: imposta la API key trascrizione in Impostazioni → Telegram.');
  const provider = cfg.sttProvider ?? 'groq';

  const buf = Buffer.from(audioB64, 'base64');
  const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'mp4' : 'webm';
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mime }), `voice.${ext}`);
  form.append('model', MODELS[provider]);
  // Lingua ESPLICITA da config (mai dalla UI: un runtime en-US faceva TRADURRE l'italiano
  // in inglese). 'auto'/assente = auto-rilevamento Whisper, che trascrive senza tradurre.
  if (cfg.sttLanguage && cfg.sttLanguage !== 'auto') form.append('language', cfg.sttLanguage);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(ENDPOINTS[provider], {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.sttApiKey}` },
      body: form,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`STT ${provider}: HTTP ${res.status}`);
  const data = (await res.json()) as { text?: string };
  const text = data.text?.trim();
  if (!text) throw new Error('Trascrizione vuota.');
  return text;
}
