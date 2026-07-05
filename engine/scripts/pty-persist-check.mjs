// Verifica v0.11: pty persistente — attach shell, scrivi un marcatore, chiudi il WS (detach),
// riattacca da una connessione nuova: stesso ptyId e marcatore presente nello scrollback.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const token = readFileSync(join(homedir(), '.claude-cockpit', 'token'), 'utf8').trim();
const project = join(homedir(), 'claude-cockpit', '.smoke');
const MARK = `pty-persist-${Math.floor(Date.now() / 1000)}`;
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

function attach() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:8130');
    ws.on('open', () => ws.send(JSON.stringify({ op: 'auth', token })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.ev === 'auth_ok') ws.send(JSON.stringify({ op: 'pty_attach', project, cmd: 'shell', cols: 100, rows: 30 }));
      if (m.ev === 'pty_attach_ok') resolve({ ws, ptyId: m.ptyId, scrollback: Buffer.from(m.scrollback, 'base64').toString('utf8') });
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('attach timeout')), 10_000);
  });
}

const a = await attach();
a.ws.send(JSON.stringify({ op: 'pty_input', ptyId: a.ptyId, data: b64(`echo ${MARK}\n`) }));
await new Promise((r) => setTimeout(r, 1500));
a.ws.close(); // detach: il pty deve restare vivo
await new Promise((r) => setTimeout(r, 800));

const b = await attach();
const samePty = b.ptyId === a.ptyId;
const hasMark = b.scrollback.includes(MARK);
console.log('--- ESITO pty-persist ---');
console.log({ samePty, hasMark });
b.ws.send(JSON.stringify({ op: 'pty_kill', ptyId: b.ptyId })); // pulizia
await new Promise((r) => setTimeout(r, 500));
console.log(`PASS=${samePty && hasMark}`);
process.exit(samePty && hasMark ? 0 : 2);
