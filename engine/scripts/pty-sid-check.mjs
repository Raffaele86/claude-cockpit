// Verifica v0.16: sessioni pty deterministiche. (1) lo spawn ha --session-id;
// (2) dopo un prompt reale il jsonl di QUEL sessionId esiste; (3) con un jsonl-esca
// più recente nello store (simula lo scheduler) il relaunch continue riprende SOLO
// il proprio id (--resume <sid>), mai -c né l'esca.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const token = readFileSync(join(homedir(), '.claude-cockpit', 'token'), 'utf8').trim();
const smoke = join(homedir(), 'claude-cockpit', '.smoke');
const project = smoke + '##sidA';
const storeDir = join(homedir(), '.claude', 'projects', smoke.replace(/[/.]/g, '-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

function attach(extra) {
  return new Promise((res, rej) => {
    const ws = new WebSocket('ws://127.0.0.1:8130');
    ws.on('open', () => ws.send(JSON.stringify({ op: 'auth', token })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.ev === 'auth_ok') ws.send(JSON.stringify({ op: 'pty_attach', project, cmd: 'claude', cols: 120, rows: 35, ...extra }));
      if (m.ev === 'pty_attach_ok') res({ ws, ptyId: m.ptyId });
    });
    setTimeout(() => rej(new Error('attach timeout')), 15000);
  });
}
const argvOf = (pat) => {
  try { return execSync(`pgrep -fa -- '${pat}'`, { encoding: 'utf8' }).trim().split('\n').filter((l) => !l.includes('pgrep')); } catch { return []; }
};

// 1) attach fresh → argv con --session-id
const a = await attach({ fresh: true });
await sleep(9000);
const spawned = argvOf('claude --session-id');
const sid = spawned.map((l) => l.match(/--session-id ([0-9a-f-]{36})/)?.[1]).find(Boolean);
console.log('sessionId assegnato:', sid);
// 2) prompt reale → nasce <sid>.jsonl
a.ws.send(JSON.stringify({ op: 'pty_input', ptyId: a.ptyId, data: b64('rispondi solo: SIDCHECK\r') }));
await sleep(25000);
const jsonlOk = sid && existsSync(join(storeDir, `${sid}.jsonl`));
a.ws.close();
// 3) esca "scheduler": jsonl finto PIÙ recente nello store
writeFileSync(join(storeDir, '99999999-dead-beef-dead-schedulertrap.jsonl'), '{"type":"queue-operation"}\n');
// 4) relaunch continue → --resume <sid>, niente -c, niente esca
const c = await attach({ launch: { continue: true, permissionMode: 'bypassPermissions' } });
await sleep(9000);
const relaunched = argvOf('claude --resume');
const resumeOwn = relaunched.some((l) => l.includes(`--resume ${sid}`));
const noTrap = !relaunched.some((l) => l.includes('schedulertrap'));
const noC = argvOf('claude -c ').length === 0;
console.log('--- ESITO pty-sid ---');
console.log({ hasSid: !!sid, jsonlOk, resumeOwn, noTrap, noC });
// cleanup
const d = await attach({});
d.ws.send(JSON.stringify({ op: 'pty_kill', ptyId: d.ptyId }));
await sleep(800);
execSync(`rm -f '${join(storeDir, '99999999-dead-beef-dead-schedulertrap.jsonl')}'`);
c.ws.close();
d.ws.close();
const pass = !!sid && jsonlOk && resumeOwn && noTrap && noC;
console.log(`PASS=${pass}`);
process.exit(pass ? 0 : 2);
