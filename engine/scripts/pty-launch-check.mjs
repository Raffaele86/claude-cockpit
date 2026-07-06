// Verifica v0.14: pty_attach con launch → il CLI parte coi flag (--permission-mode plan
// visibile nella statusline). Confronto sullo scrollback ripulito da ANSI e spazi.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const token = readFileSync(join(homedir(), '.claude-cockpit', 'token'), 'utf8').trim();
const project = join(homedir(), 'claude-cockpit', '.smoke');

function attach(launch) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:8130');
    ws.on('open', () => ws.send(JSON.stringify({ op: 'auth', token })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.ev === 'auth_ok') ws.send(JSON.stringify({ op: 'pty_attach', project, cmd: 'claude', cols: 120, rows: 35, launch }));
      if (m.ev === 'pty_attach_ok') resolve({ ws, ptyId: m.ptyId, scrollback: m.scrollback });
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('attach timeout')), 15_000);
  });
}

const a = await attach({ permissionMode: 'plan' });
a.ws.close();
await new Promise((r) => setTimeout(r, 15_000)); // avvio TUI
const b = await attach(undefined);
const clean = Buffer.from(b.scrollback, 'base64').toString('utf8').replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\s/g, '');
const planOn = clean.includes('planmodeon');
console.log('--- ESITO pty-launch ---');
console.log({ samePty: b.ptyId === a.ptyId, planOn });
b.ws.send(JSON.stringify({ op: 'pty_kill', ptyId: b.ptyId }));
await new Promise((r) => setTimeout(r, 600));
console.log(`PASS=${planOn}`);
process.exit(planOn ? 0 : 2);
