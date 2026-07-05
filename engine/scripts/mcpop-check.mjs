// Verifica v0.9: mcp_add/mcp_remove con scope PROJECT sulla dir .smoke —
// scrive/pulisce .smoke/.mcp.json senza toccare la config utente (~/.claude.json).
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const token = readFileSync(join(homedir(), '.claude-cockpit', 'token'), 'utf8').trim();
const project = join(homedir(), 'claude-cockpit', '.smoke');
const mcpJson = join(project, '.mcp.json');
const NAME = 'smoke-fake-mcp';

const ws = new WebSocket('ws://127.0.0.1:8130');
const send = (m) => ws.send(JSON.stringify(m));
const st = { added: false, statusListed: false, removed: false };
const deadline = setTimeout(() => finish('TIMEOUT'), 90_000);

function readEntry() {
  try {
    return JSON.parse(readFileSync(mcpJson, 'utf8')).mcpServers?.[NAME];
  } catch {
    return undefined;
  }
}

function finish(reason) {
  clearTimeout(deadline);
  console.log('--- ESITO mcpop ---');
  console.log(st);
  const ok = st.added && st.statusListed && st.removed;
  console.log(`reason=${reason} PASS=${ok}`);
  process.exit(ok ? 0 : 2);
}

let phase = 'add';
ws.on('open', () => send({ op: 'auth', token }));
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.ev === 'auth_ok') {
    send({
      op: 'mcp_add',
      project,
      server: { name: NAME, transport: 'http', target: 'http://127.0.0.1:9/nope', headers: ['X-Test: 1'], scope: 'project' },
    });
  } else if (m.ev === 'mcp_op_done' && phase === 'add') {
    if (m.error) {
      console.log(`add error: ${m.error}`);
      return finish('add-failed');
    }
    const entry = readEntry();
    st.added = entry?.url === 'http://127.0.0.1:9/nope';
    phase = 'status';
  } else if (m.ev === 'mcp_status' && phase === 'status') {
    // Il server finto può risultare failed/pending: basta che sia elencato.
    st.statusListed = m.servers.some((s) => s.name === NAME);
    phase = 'remove';
    send({ op: 'mcp_remove', project, name: NAME });
  } else if (m.ev === 'mcp_op_done' && phase === 'remove') {
    if (m.error) {
      console.log(`remove error: ${m.error}`);
      return finish('remove-failed');
    }
    st.removed = readEntry() === undefined;
    finish('done');
  } else if (m.ev === 'error') {
    console.log(`[error] ${m.message}`);
  }
});
