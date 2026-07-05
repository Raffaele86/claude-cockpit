// Verifica A1 (history + persistenza session_id) + B1 (mcp_status).
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const token = readFileSync(join(homedir(), '.claude-cockpit', 'token'), 'utf8').trim();
const home = join(homedir(), 'claude-cockpit', '.smoke'); // dir dedicata: MAI sporcare la chat del progetto home
const storePath = join(homedir(), '.claude-cockpit', 'sessions.json');
const ws = new WebSocket('ws://127.0.0.1:8130');
const send = (m) => ws.send(JSON.stringify(m));

const st = { sessionId: null, historyCount: 0, historyHasUser: false, mcp: 0, mcpConnected: 0, storeOk: false };
const deadline = setTimeout(() => finish('TIMEOUT'), 120_000);

function finish(reason) {
  clearTimeout(deadline);
  if (existsSync(storePath)) {
    const map = JSON.parse(readFileSync(storePath, 'utf8'));
    st.storeOk = map[home] === st.sessionId && !!st.sessionId;
  }
  console.log('--- ESITO A1+B1 ---');
  console.log(`session_id: ${st.sessionId}`);
  console.log(`sessions.json persistito col session_id giusto: ${st.storeOk}`);
  console.log(`history: ${st.historyCount} messaggi (con turno user: ${st.historyHasUser})`);
  console.log(`mcp_status: ${st.mcp} server (${st.mcpConnected} connected)`);
  const ok = st.storeOk && st.historyCount > 0 && st.historyHasUser && st.mcp > 0;
  console.log(`reason=${reason} PASS=${ok}`);
  ws.close();
  process.exit(ok ? 0 : 2);
}

ws.on('open', () => send({ op: 'auth', token }));

ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  switch (m.ev) {
    case 'auth_ok':
      send({ op: 'prompt', project: home, text: 'Rispondi con la sola parola: pronto' });
      break;
    case 'init':
      st.sessionId = m.session_id;
      break;
    case 'result':
      // dopo il primo turno chiedo storico + stato mcp
      send({ op: 'history', project: home });
      send({ op: 'mcp_status', project: home });
      break;
    case 'history':
      st.historyCount = m.messages.length;
      st.historyHasUser = m.messages.some((x) => x.type === 'user');
      if (st.mcp > 0) setTimeout(() => finish('done'), 200);
      break;
    case 'mcp_status':
      st.mcp = m.servers.length;
      st.mcpConnected = m.servers.filter((s) => s.status === 'connected').length;
      console.log(`[mcp] ${m.servers.slice(0, 6).map((s) => s.name + ':' + s.status).join(' ')}`);
      if (st.historyCount > 0) setTimeout(() => finish('done'), 200);
      break;
    case 'error':
      console.log(`[error] ${m.message}`);
      break;
  }
});

ws.on('error', (e) => {
  console.error('[A1B1] WS', e.message);
  process.exit(1);
});
