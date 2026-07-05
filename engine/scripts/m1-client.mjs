// Verifica M1: si autentica, manda un prompt e stampa gli eventi reali dello stream.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const token = readFileSync(join(homedir(), '.claude-cockpit', 'token'), 'utf8').trim();
const project = homedir();
const ws = new WebSocket('ws://127.0.0.1:8130');

const deadline = setTimeout(() => {
  console.error('\n[M1] TIMEOUT dopo 120s');
  process.exit(1);
}, 120_000);

ws.on('open', () => ws.send(JSON.stringify({ op: 'auth', token })));

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  switch (msg.ev) {
    case 'auth_ok':
      console.log(`[auth_ok] engine v${msg.engineVersion}`);
      ws.send(JSON.stringify({ op: 'prompt', project, text: 'Rispondi esattamente con la sola parola: ciao' }));
      break;
    case 'init':
      console.log(`[init] session_id=${msg.session_id} model=${msg.model} mode=${msg.permissionMode} tools=${msg.tools.length} slash=${msg.slash_commands.length}`);
      break;
    case 'stream': {
      const e = msg.event;
      if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') {
        process.stdout.write(e.delta.text);
      } else {
        console.log(`[stream] ${e.type}`);
      }
      break;
    }
    case 'assistant':
      console.log(`\n[assistant] blocchi=${JSON.stringify(msg.message.content?.map((b) => b.type))}`);
      break;
    case 'result':
      console.log(`[result] subtype=${msg.subtype} is_error=${msg.is_error} turns=${msg.num_turns} cost_usd=${msg.cost_usd?.toFixed(4)}`);
      console.log(`[result] testo: ${msg.result}`);
      clearTimeout(deadline);
      ws.close();
      process.exit(msg.is_error ? 1 : 0);
      break;
    default:
      console.log(`[${msg.ev}] ${JSON.stringify(msg).slice(0, 200)}`);
  }
});

ws.on('error', (err) => {
  console.error('[M1] errore WS:', err.message);
  process.exit(1);
});
