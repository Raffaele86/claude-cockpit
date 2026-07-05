// Verifica v0.6: due schede sullo stesso progetto lavorano in parallelo e restano indipendenti.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const token = readFileSync(join(homedir(), '.claude-cockpit', 'token'), 'utf8').trim();
const base = join(homedir(), 'claude-cockpit', '.smoke');
const keyA = base;
const keyB = `${base}##t2`;

const ws = new WebSocket('ws://127.0.0.1:8130');
const send = (m) => ws.send(JSON.stringify(m));
const st = { a: '', b: '', resetB: false, aAliveAfterReset: false };
const deadline = setTimeout(() => finish('TIMEOUT'), 180_000);

function finish(reason) {
  clearTimeout(deadline);
  console.log('--- ESITO tabs ---');
  console.log(`scheda A (main): "${st.a}" | scheda B (t2): "${st.b}"`);
  console.log(`reset B: ${st.resetB} | A risponde ancora dopo reset B: ${st.aAliveAfterReset}`);
  const ok = st.a.includes('uno') && st.b.includes('due') && st.resetB && st.aAliveAfterReset;
  console.log(`reason=${reason} PASS=${ok}`);
  send({ op: 'session_reset', project: keyA });
  send({ op: 'session_reset', project: keyB });
  setTimeout(() => process.exit(ok ? 0 : 2), 500);
}

let phase = 'parallel';
ws.on('open', () => send({ op: 'auth', token }));
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.ev === 'auth_ok') {
    // Prompt in parallelo sulle due schede.
    send({ op: 'prompt', project: keyA, text: 'Rispondi esattamente con la sola parola: uno' });
    send({ op: 'prompt', project: keyB, text: 'Rispondi esattamente con la sola parola: due' });
  } else if (m.ev === 'result' && phase === 'parallel') {
    if (m.project === keyA) st.a = m.result ?? '';
    if (m.project === keyB) st.b = m.result ?? '';
    if (st.a && st.b) {
      phase = 'reset';
      send({ op: 'session_reset', project: keyB });
    }
  } else if (m.ev === 'session_reset' && m.project === keyB && phase === 'reset') {
    st.resetB = true;
    phase = 'verify';
    send({ op: 'prompt', project: keyA, text: 'Rispondi esattamente con la sola parola: ancora' });
  } else if (m.ev === 'result' && phase === 'verify' && m.project === keyA) {
    st.aAliveAfterReset = (m.result ?? '').includes('ancora');
    finish('done');
  } else if (m.ev === 'error') {
    console.log('ERROR:', m.message);
  }
});
