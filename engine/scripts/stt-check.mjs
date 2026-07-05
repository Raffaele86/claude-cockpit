// Verifica v0.12 op stt:
// A) istanza isolata SENZA telegram.json → errore esplicito sulla chiave mancante;
// B) engine reale: wav sintetico (tono 1s) → la pipeline arriva a Groq (testo o "Trascrizione vuota").
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

// wav PCM 16bit mono 16kHz, 1s di tono 440Hz — sufficiente per validare l'HTTP path.
function sineWav() {
  const rate = 16000;
  const n = rate;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]).toString('base64');
}

function sttOnce(port, token, audio) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => ws.send(JSON.stringify({ op: 'auth', token })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.ev === 'auth_ok') ws.send(JSON.stringify({ op: 'stt', audio, mime: 'audio/wav', lang: 'it' }));
      if (m.ev === 'stt_result') { ws.close(); resolve(m); }
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('timeout')), 30_000);
  });
}

// A) istanza isolata senza chiave
const dir = mkdtempSync(join(tmpdir(), 'cockpit-stt-'));
const engine = spawn('node', [join(import.meta.dirname, '..', 'dist', 'server.js')], {
  env: { ...process.env, COCKPIT_DIR: dir, COCKPIT_PORT: '8132' },
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 2000));
const isoToken = readFileSync(join(dir, 'token'), 'utf8').trim();
const a = await sttOnce(8132, isoToken, sineWav());
engine.kill();
rmSync(dir, { recursive: true, force: true });
const noKeyOk = Boolean(a.error && /API key|STT non configurato/i.test(a.error));

// B) engine reale con chiave Groq vera
const realToken = readFileSync(join(homedir(), '.claude-cockpit', 'token'), 'utf8').trim();
const b = await sttOnce(8130, realToken, sineWav());
// tono puro: Whisper può rispondere testo spurio o vuoto — conta che NON sia un errore di auth/HTTP
const pipelineOk = Boolean(b.text) || /Trascrizione vuota/.test(b.error ?? '');

console.log('--- ESITO stt ---');
console.log({ noKeyOk, pipelineOk, isoError: a.error, real: b.text ?? b.error });
console.log(`PASS=${noKeyOk && pipelineOk}`);
process.exit(noKeyOk && pipelineOk ? 0 : 2);
