// Verifica engine_stats/proc_kill: istanza engine ISOLATA (COCKPIT_DIR temporaneo + porta dedicata).
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const dir = mkdtempSync(join(tmpdir(), 'cockpit-stats-'));

const engine = spawn('node', [join(import.meta.dirname, '..', 'dist', 'server.js')], {
  env: { ...process.env, COCKPIT_DIR: dir, COCKPIT_PORT: '8132' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
engine.stderr.on('data', (d) => process.stderr.write(d));

const st = { shapeOk: false, killRejected: false };
const finish = (reason) => {
  console.log('--- ESITO stats-check ---');
  console.log(st);
  const ok = Object.values(st).every(Boolean);
  console.log(`reason=${reason} PASS=${ok}`);
  engine.kill();
  rmSync(dir, { recursive: true, force: true });
  process.exit(ok ? 0 : 2);
};
setTimeout(() => finish('TIMEOUT'), 30_000);

await new Promise((r) => setTimeout(r, 2000)); // attesa avvio engine
const token = readFileSync(join(dir, 'token'), 'utf8').trim();
const ws = new WebSocket('ws://127.0.0.1:8132');
const send = (m) => ws.send(JSON.stringify(m));

let phase = 'stats';
ws.on('open', () => send({ op: 'auth', token }));
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.ev === 'auth_ok') {
    send({ op: 'engine_stats' });
    return;
  }
  if (phase === 'stats' && m.ev === 'engine_stats') {
    const s = m.stats;
    st.shapeOk = typeof s.version === 'string' && s.version.length > 0 && s.rssMb > 0 && Array.isArray(s.procs);
    console.log(`engine_stats: version=${s.version} pid=${s.pid} rssMb=${s.rssMb} currentMb=${s.currentMb} procs=${s.procs.length}`);
    phase = 'kill';
    send({ op: 'proc_kill', pid: 1 }); // pid 1 non è discendente dell'engine
    return;
  }
  if (phase === 'kill' && m.ev === 'proc_killed') {
    st.killRejected = m.pid === 1 && m.ok === false;
    console.log(`proc_kill(1): ok=${m.ok} error=${m.error ?? ''}`);
    finish('done');
  }
});
