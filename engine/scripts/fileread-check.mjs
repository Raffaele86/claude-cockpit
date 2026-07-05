// Verifica v0.4.1: op file_read (contenuto md + errore su path inesistente).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const token = readFileSync(join(homedir(), '.claude-cockpit', 'token'), 'utf8').trim();
const home = join(homedir(), 'claude-cockpit', '.smoke'); // dir dedicata: MAI sporcare la chat del progetto home
const ws = new WebSocket('ws://127.0.0.1:8130');
const send = (m) => ws.send(JSON.stringify(m));
const st = { ok: false, err: false };
setTimeout(() => finish('TIMEOUT'), 20_000);

function finish(reason) {
  console.log(`--- ESITO file_read --- contenuto ok: ${st.ok} | errore su inesistente: ${st.err} | reason=${reason} PASS=${st.ok && st.err}`);
  process.exit(st.ok && st.err ? 0 : 2);
}

ws.on('open', () => send({ op: 'auth', token }));
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.ev === 'auth_ok') {
    send({ op: 'file_read', project: home, path: '~/claude-cockpit/TELEGRAM-SETUP.md' });
    send({ op: 'file_read', project: home, path: '/non/esiste.md' });
  } else if (m.ev === 'file_content') {
    if (m.path.endsWith('TELEGRAM-SETUP.md')) {
      st.ok = Boolean(m.content?.startsWith('# Setup bot Telegram'));
      console.log(`md: ${m.content?.length} char, inizia bene: ${st.ok}`);
    } else {
      st.err = Boolean(m.error);
      console.log(`inesistente → error: ${m.error?.slice(0, 60)}`);
    }
    if (st.ok && st.err) finish('done');
  }
});
