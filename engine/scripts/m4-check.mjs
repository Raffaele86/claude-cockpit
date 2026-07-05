// Verifica M4: registry, quickactions, models, set_model, upsert/remove, 2 sessioni parallele indipendenti.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const token = readFileSync(join(homedir(), '.claude-cockpit', 'token'), 'utf8').trim();
const home = homedir();
const p2 = join(home, 'cockpit-m3-test');
const ws = new WebSocket('ws://127.0.0.1:8130');

const state = { projects: 0, quickactions: 0, models: 0, inits: {}, results: {}, upsertSeen: false };
const send = (m) => ws.send(JSON.stringify(m));
const deadline = setTimeout(() => finish('TIMEOUT'), 150_000);

function finish(reason) {
  clearTimeout(deadline);
  const sids = Object.values(state.inits);
  const parallel = sids.length >= 2 && sids[0] !== sids[1];
  console.log('--- ESITO M4 ---');
  console.log(`projects ricevuti: ${state.projects}`);
  console.log(`quickactions: ${state.quickactions}`);
  console.log(`models: ${state.models}`);
  console.log(`upsert broadcast visto: ${state.upsertSeen}`);
  console.log(`sessioni parallele indipendenti (session_id diversi): ${parallel} [${sids.join(', ')}]`);
  console.log(`results: ${JSON.stringify(state.results)}`);
  const ok =
    state.projects > 0 && state.quickactions > 0 && state.models > 0 && state.upsertSeen && parallel &&
    Object.keys(state.results).length >= 2;
  console.log(`reason=${reason} PASS=${ok}`);
  ws.close();
  process.exit(ok ? 0 : 2);
}

ws.on('open', () => send({ op: 'auth', token }));

ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  switch (m.ev) {
    case 'auth_ok':
      // registry+quickactions arrivano subito dopo auth_ok
      send({ op: 'models_list', project: home });
      send({ op: 'set_model', project: home, model: 'claude-haiku-4-5' });
      send({ op: 'projects_upsert', project: { name: 'tmp-m4', path: '/tmp/cockpit-m4-tmp', icon: '🧪' } });
      // due sessioni parallele
      send({ op: 'prompt', project: home, text: 'Rispondi con la sola lettera: A' });
      send({ op: 'prompt', project: p2, text: 'Rispondi con la sola lettera: B' });
      break;
    case 'projects':
      state.projects = m.list.length;
      if (m.list.some((p) => p.path === '/tmp/cockpit-m4-tmp')) {
        state.upsertSeen = true;
        send({ op: 'projects_remove', path: '/tmp/cockpit-m4-tmp' });
      }
      break;
    case 'quickactions':
      state.quickactions = m.list.length;
      console.log(`[quickactions] ${m.list.map((a) => a.label).join(' | ')}`);
      break;
    case 'models':
      state.models = m.models.length;
      console.log(`[models] ${m.models.slice(0, 4).map((x) => x.model).join(', ')} … (${m.models.length} tot)`);
      break;
    case 'init':
      state.inits[m.project] = m.session_id;
      break;
    case 'result':
      state.results[m.project.split('/').at(-1)] = m.subtype;
      if (Object.keys(state.results).length >= 2) setTimeout(() => finish('done'), 500);
      break;
    case 'error':
      console.log(`[error] ${m.message}`);
      break;
  }
});

ws.on('error', (e) => {
  console.error('[M4] WS', e.message);
  process.exit(1);
});
