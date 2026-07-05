// Verifica v0.3: session_reset (sessions.json ripulito + ev session_reset) + prompt con immagine.
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const token = readFileSync(join(homedir(), '.claude-cockpit', 'token'), 'utf8').trim();
const home = join(homedir(), 'claude-cockpit', '.smoke'); // dir dedicata: MAI sporcare la chat del progetto home
const storePath = join(homedir(), '.claude-cockpit', 'sessions.json');
// PNG 32x32 rosso pieno
const RED_PX =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKElEQVR4nO3NMQEAAAjDMMC/ZzDBvlRA01vZJvwHAAAAAAAAAAAAbx2jxAE/i2AjOgAAAABJRU5ErkJggg==';

const ws = new WebSocket('ws://127.0.0.1:8130');
const send = (m) => ws.send(JSON.stringify(m));
const st = { resetEv: false, storeCleared: false, imgAnswer: '' };
const deadline = setTimeout(() => finish('TIMEOUT'), 120_000);

function finish(reason) {
  clearTimeout(deadline);
  console.log('--- ESITO v0.3 ---');
  console.log(`session_reset ev: ${st.resetEv}`);
  console.log(`sessions.json ripulito: ${st.storeCleared}`);
  console.log(`risposta immagine: ${st.imgAnswer.slice(0, 80)}`);
  const ok = st.resetEv && st.storeCleared && /ross|red/i.test(st.imgAnswer);
  console.log(`reason=${reason} PASS=${ok}`);
  ws.close();
  process.exit(ok ? 0 : 2);
}

ws.on('open', () => send({ op: 'auth', token }));
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  switch (m.ev) {
    case 'auth_ok':
      send({ op: 'session_reset', project: home });
      break;
    case 'session_reset': {
      st.resetEv = true;
      const map = existsSync(storePath) ? JSON.parse(readFileSync(storePath, 'utf8')) : {};
      st.storeCleared = !(home in map);
      send({
        op: 'prompt',
        project: home,
        text: 'Di che colore è questa immagine? Rispondi con una sola parola.',
        images: [{ media_type: 'image/png', data: RED_PX }],
      });
      break;
    }
    case 'result':
      st.imgAnswer = m.result ?? '';
      finish('done');
      break;
    case 'error':
      console.log('ERROR:', m.message);
      break;
  }
});
