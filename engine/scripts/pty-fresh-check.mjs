// Verifica v0.15: (1) pty_attach con fresh:true scarta il pty esistente (ptyId nuovo);
// (2) relaunch con continue senza conversazione di scheda → niente -c → processo vivo (banner).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const token = readFileSync(join(homedir(), '.claude-cockpit', 'token'), 'utf8').trim();
const project = join(homedir(), 'claude-cockpit', '.smoke') + '##fresh';

function attach(extra) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:8130');
    ws.on('open', () => ws.send(JSON.stringify({ op: 'auth', token })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.ev === 'auth_ok') ws.send(JSON.stringify({ op: 'pty_attach', project, cmd: 'claude', cols: 120, rows: 35, ...extra }));
      if (m.ev === 'pty_attach_ok') resolve({ ws, ptyId: m.ptyId, scrollback: m.scrollback });
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('attach timeout')), 15_000);
  });
}

const clean = (b64) => Buffer.from(b64, 'base64').toString('utf8').replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\s/g, '');

// 1) attach normale → pty A
const a = await attach({});
a.ws.close();
await new Promise((r) => setTimeout(r, 12_000));
// 2) attach fresh → pty B ≠ A, scrollback ripulito (niente replay del vecchio)
const b = await attach({ fresh: true });
const freshOk = b.ptyId !== a.ptyId && (b.scrollback === '' || b.scrollback.length < 200);
b.ws.close();
await new Promise((r) => setTimeout(r, 12_000));
// 3) relaunch continue su scheda SENZA conversazione → niente -c → il CLI parte (banner nello scrollback)
const c = await attach({ launch: { continue: true, permissionMode: 'bypassPermissions' } });
await new Promise((r) => setTimeout(r, 12_000));
const d = await attach({});
const screen = clean(d.scrollback);
const aliveOk = screen.length > 100 && !screen.includes('Noconversationfound');
console.log('--- ESITO pty-fresh ---');
console.log({ freshOk, samePty: d.ptyId === c.ptyId, aliveOk });
d.ws.send(JSON.stringify({ op: 'pty_kill', ptyId: d.ptyId }));
await new Promise((r) => setTimeout(r, 600));
c.ws.close();
d.ws.close();
const pass = freshOk && aliveOk;
console.log(`PASS=${pass}`);
process.exit(pass ? 0 : 2);
