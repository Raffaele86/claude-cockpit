// Verifica v0.5: dir_list (flag project) + set_provider glm (sessione GLM risponde, model glm-*).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const token = readFileSync(join(homedir(), '.claude-cockpit', 'token'), 'utf8').trim();
const home = join(homedir(), 'claude-cockpit', '.smoke'); // dir dedicata: MAI sporcare la chat del progetto home
const ws = new WebSocket('ws://127.0.0.1:8130');
const send = (m) => ws.send(JSON.stringify(m));
const st = { dirs: 0, projects: 0, providerEv: false, model: '', answered: false };
const deadline = setTimeout(() => finish('TIMEOUT'), 120_000);

function finish(reason) {
  clearTimeout(deadline);
  console.log('--- ESITO v0.5 ---');
  console.log(`dir_list: ${st.dirs} voci, ${st.projects} progetti`);
  console.log(`provider ev: ${st.providerEv} | init model: ${st.model} | risposta: ${st.answered}`);
  const ok = st.dirs > 0 && st.projects > 0 && st.providerEv && st.model === 'glm-5.2' && st.answered;
  console.log(`reason=${reason} PASS=${ok}`);
  // ripristina provider claude e chiudi
  send({ op: 'set_provider', project: home, provider: 'claude' });
  setTimeout(() => process.exit(ok ? 0 : 2), 500);
}

ws.on('open', () => send({ op: 'auth', token }));
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  switch (m.ev) {
    case 'auth_ok':
      send({ op: 'dir_list', path: home });
      break;
    case 'dir_entries':
      st.dirs = m.entries.length;
      st.projects = m.entries.filter((e) => e.project).length;
      console.log('progetti trovati:', m.entries.filter((e) => e.project).map((e) => e.name).slice(0, 6).join(', '));
      send({ op: 'set_provider', project: home, provider: 'glm' });
      break;
    case 'provider':
      if (m.provider === 'glm' && !st.providerEv) {
        st.providerEv = true;
        send({ op: 'prompt', project: home, text: 'Rispondi esattamente con la sola parola: pronto' });
      }
      break;
    case 'init':
      st.model = m.model ?? '';
      break;
    case 'result':
      st.answered = !m.is_error;
      console.log('result:', m.result?.slice(0, 40));
      finish('done');
      break;
    case 'error':
      console.log('ERROR:', m.message);
      break;
  }
});
