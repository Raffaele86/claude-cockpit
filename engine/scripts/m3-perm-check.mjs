// Verifica M3: forza un permesso (tool MCP non in allowlist), risponde allow-once, verifica il round-trip.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const token = readFileSync(join(homedir(), '.claude-cockpit', 'token'), 'utf8').trim();
const project = join(homedir(), 'cockpit-m3-test');
const ws = new WebSocket('ws://127.0.0.1:8130');

let sawPermission = false;
const deadline = setTimeout(() => {
  console.error('[M3] TIMEOUT');
  process.exit(1);
}, 120_000);

ws.on('open', () => ws.send(JSON.stringify({ op: 'auth', token })));

ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  switch (m.ev) {
    case 'auth_ok':
      ws.send(
        JSON.stringify({
          op: 'prompt',
          project,
          text: 'Chiama lo strumento mcp__mcp-gateway__ga4__ga4_realtime per vedere gli utenti in tempo reale. Non fare altro, poi riporta il numero.',
        }),
      );
      break;
    case 'permission_request':
      sawPermission = true;
      console.log(`[PERMISSION] tool=${m.toolName} requestId=${m.requestId} suggestions=${(m.suggestions ?? []).length}`);
      console.log(`[PERMISSION] input=${JSON.stringify(m.input).slice(0, 120)}`);
      ws.send(JSON.stringify({ op: 'permission_decision', requestId: m.requestId, decision: 'allow-once' }));
      console.log('[DECISION] inviato allow-once');
      break;
    case 'result':
      console.log(`[result] subtype=${m.subtype} is_error=${m.is_error} sawPermission=${sawPermission}`);
      clearTimeout(deadline);
      ws.close();
      process.exit(sawPermission ? 0 : 2);
      break;
    case 'error':
      console.log(`[error] ${m.message}`);
      break;
  }
});

ws.on('error', (e) => {
  console.error('[M3] WS', e.message);
  process.exit(1);
});
