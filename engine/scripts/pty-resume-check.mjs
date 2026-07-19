// Verifica v0.33: le sessioni CLI sopravvivono a un RESTART dell'engine (update in mezzo).
// Istanza engine ISOLATA (COCKPIT_DIR temporaneo, porta 8132) sulla dir .smoke:
// 1) attach claude → sessionId S1, prompt reale → jsonl su disco;
// 2) kill dell'engine (simula update) → pty morto;
// 3) engine nuovo, stesso COCKPIT_DIR: attach della STESSA scheda → sessionId === S1 (--resume).
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const dir = mkdtempSync(join(tmpdir(), 'cockpit-resume-'));
const cwd = join(homedir(), 'claude-cockpit', '.smoke');
const project = cwd + '##resume';
const slug = cwd.replace(/[/.]/g, '-');
const PORT = '8132';
const serverJs = join(import.meta.dirname, '..', 'dist', 'server.js');

// Env pulita stile systemd: le var CLAUDE* della sessione che lancia lo smoke renderebbero
// il claude del pty una "child session" che NON scrive transcript (jsonl mai creato).
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^CLAUDE/.test(k)));

function startEngine() {
  const p = spawn('node', [serverJs], {
    env: { ...cleanEnv, COCKPIT_DIR: dir, COCKPIT_PORT: PORT },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stderr.on('data', (d) => process.stderr.write(d));
  return p;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

function attach(token, extra = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    const out = { text: '' }; // stream live di pty_data (oltre allo scrollback iniziale)
    ws.on('open', () => ws.send(JSON.stringify({ op: 'auth', token })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.ev === 'auth_ok')
        ws.send(JSON.stringify({ op: 'pty_attach', project, cmd: 'claude', cols: 120, rows: 35, ...extra }));
      if (m.ev === 'pty_data') out.text += Buffer.from(m.data, 'base64').toString('utf8');
      if (m.ev === 'pty_attach_ok') resolve({ ws, ptyId: m.ptyId, sessionId: m.sessionId, scrollback: m.scrollback, out });
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('attach timeout')), 20_000);
  });
}

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\s/g, '');

/** Bonifica: i pty orfani del kill -9 dell'engine (bash/claude con cwd .smoke). */
function reapSmokeOrphans() {
  try {
    execSync(
      `for p in /proc/[0-9]*; do [ "$(readlink -f $p/cwd 2>/dev/null)" = "${cwd}" ] && kill -9 $(basename $p) 2>/dev/null; done; true`,
      { shell: '/bin/bash' },
    );
  } catch { /* best effort */ }
}

let engine = startEngine();
const st = { s1: '', jsonl: false, resumedSid: '', alive: false };
try {
  await sleep(2500);
  const token = readFileSync(join(dir, 'token'), 'utf8').trim();

  // 1) sessione con una conversazione reale: digita quando il composer c'è DAVVERO
  const a = await attach(token, { fresh: true });
  st.s1 = a.sessionId ?? '';
  const MARK = 'Rispondi solo con la parola: pronto';
  for (let i = 0; i < 12 && !stripAnsi(a.out.text).includes(stripAnsi(MARK)); i++) {
    await sleep(5000); // TUI su? riprova a digitare finché il testo non compare a schermo
    a.ws.send(JSON.stringify({ op: 'pty_input', ptyId: a.ptyId, data: b64(MARK) }));
    await sleep(1200);
  }
  a.ws.send(JSON.stringify({ op: 'pty_input', ptyId: a.ptyId, data: b64('\r') }));
  const jsonlPath = join(homedir(), '.claude', 'projects', slug, `${st.s1}.jsonl`);
  for (let i = 0; i < 30 && !st.jsonl; i++) {
    await sleep(3000);
    st.jsonl = existsSync(jsonlPath) && statSync(jsonlPath).size > 0;
  }
  a.ws.close();

  // 2) "update": engine ucciso di colpo
  engine.kill('SIGKILL');
  await sleep(1000);
  reapSmokeOrphans(); // i pty orfani vanno giù come farebbe systemd (KillMode control-group)
  await sleep(500);

  // 3) engine nuovo, stessa scheda → la conversazione risorge con lo stesso sessionId
  engine = startEngine();
  await sleep(2500);
  const b = await attach(token);
  st.resumedSid = b.sessionId ?? '';
  await sleep(15_000);
  const c = await attach(token); // ri-attach per leggere lo scrollback accumulato
  const screen = Buffer.from(c.scrollback, 'base64').toString('utf8').replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\s/g, '');
  st.alive = screen.length > 100 && !screen.includes('Noconversationfound');
  c.ws.send(JSON.stringify({ op: 'pty_kill', ptyId: c.ptyId }));
  await sleep(600);
  b.ws.close();
  c.ws.close();
} finally {
  engine.kill('SIGKILL');
  await sleep(500);
  reapSmokeOrphans();
  rmSync(dir, { recursive: true, force: true });
}

console.log('--- ESITO pty-resume ---');
console.log(st);
const pass = !!st.s1 && st.jsonl && st.resumedSid === st.s1 && st.alive;
console.log(`PASS=${pass}`);
process.exit(pass ? 0 : 2);
