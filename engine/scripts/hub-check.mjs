// Verifica services_status + todos_list su un'istanza engine ISOLATA
// (COCKPIT_DIR temporaneo + porta libera) — i file reali dell'utente non vengono toccati.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const dir = mkdtempSync(join(tmpdir(), 'cockpit-hub-'));

// Mini server HTTP locale che risponde 200 (servizio "vivo").
const upServer = createServer((_req, res) => {
  res.writeHead(200);
  res.end('ok');
});
await new Promise((r) => upServer.listen(0, '127.0.0.1', r));
const upPort = upServer.address().port;

// Porta chiusa: nessun listener, la connessione fallisce (servizio "morto").
const downServer = createServer();
await new Promise((r) => downServer.listen(0, '127.0.0.1', r));
const downPort = downServer.address().port;
await new Promise((r) => downServer.close(r));

writeFileSync(
  join(dir, 'services.json'),
  JSON.stringify({
    services: [
      { name: 'Up', url: `http://127.0.0.1:${upPort}/` },
      { name: 'Down', url: `http://127.0.0.1:${downPort}/` },
    ],
  }),
);
// Nessun todomio.json: feature spenta.

const enginePort = 8132;
const engine = spawn('node', [join(import.meta.dirname, '..', 'dist', 'server.js')], {
  env: { ...process.env, COCKPIT_DIR: dir, COCKPIT_PORT: String(enginePort) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
engine.stderr.on('data', (d) => process.stderr.write(d));

const st = { servicesUpOk: false, servicesDownOk: false, todosError: false };
const finish = (reason) => {
  console.log('--- ESITO hub ---');
  console.log(st);
  const ok = Object.values(st).every(Boolean);
  console.log(`reason=${reason} PASS=${ok}`);
  engine.kill();
  upServer.close();
  rmSync(dir, { recursive: true, force: true });
  process.exit(ok ? 0 : 2);
};
setTimeout(() => finish('TIMEOUT'), 30_000);

await new Promise((r) => setTimeout(r, 2000)); // attesa avvio engine
const token = (await import('node:fs')).readFileSync(join(dir, 'token'), 'utf8').trim();
const ws = new WebSocket(`ws://127.0.0.1:${enginePort}`);
const send = (m) => ws.send(JSON.stringify(m));

let phase = 'services';
ws.on('open', () => send({ op: 'auth', token }));
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.ev === 'auth_ok') {
    send({ op: 'services_status' });
    return;
  }
  if (phase === 'services' && m.ev === 'services_status') {
    const up = m.services.find((s) => s.name === 'Up');
    const down = m.services.find((s) => s.name === 'Down');
    st.servicesUpOk = up?.ok === true;
    st.servicesDownOk = down?.ok === false;
    phase = 'todos';
    send({ op: 'todos_list' });
  } else if (phase === 'todos' && m.ev === 'todos_list') {
    st.todosError = m.error === 'ToDoMio non configurato';
    finish('done');
  }
});
