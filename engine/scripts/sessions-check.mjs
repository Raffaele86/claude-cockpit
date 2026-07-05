// Verifica v0.3.1: sessions_list + session_open (resume di una chat passata) + history non vuota.
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const token = readFileSync(join(homedir(), '.claude-cockpit', 'token'), 'utf8').trim();
const home = join(homedir(), 'claude-cockpit', '.smoke'); // dir dedicata: MAI sporcare la chat del progetto home
const storePath = join(homedir(), '.claude-cockpit', 'sessions.json');

const ws = new WebSocket('ws://127.0.0.1:8130');
const send = (m) => ws.send(JSON.stringify(m));
const st = { count: 0, chosen: null, openedEv: false, storeOk: false, history: 0 };
const deadline = setTimeout(() => finish('TIMEOUT'), 60_000);

function finish(reason) {
  clearTimeout(deadline);
  console.log('--- ESITO v0.3.1 ---');
  console.log(`sessions_list: ${st.count} sessioni`);
  console.log(`session_open ev: ${st.openedEv} (id ${st.chosen?.slice(0, 8)})`);
  console.log(`sessions.json aggiornato: ${st.storeOk}`);
  console.log(`history dopo open: ${st.history} messaggi`);
  console.log(`full-text: ${st.search} risultati (snippet ok: ${st.searchSnippetOk})`);
  const ok = st.count > 0 && st.catsOk && st.openedEv && st.storeOk && st.history > 0 && st.search > 0 && st.searchSnippetOk;
  console.log(`reason=${reason} PASS=${ok}`);
  ws.close();
  process.exit(ok ? 0 : 2);
}

ws.on('open', () => send({ op: 'auth', token }));
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  switch (m.ev) {
    case 'auth_ok':
      send({ op: 'sessions_search', project: home, query: 'colore è questa immagine' });
      break;
    case 'sessions_search':
      st.search = m.results.length;
      st.searchSnippetOk = m.results.every((r) => r.snippet.length > 0);
      console.log(`search "colore è questa immagine": ${st.search} risultati, primo snippet: "${m.results[0]?.snippet.slice(0, 60) ?? ''}"`);
      send({ op: 'sessions_list', project: home });
      break;
    case 'sessions': {
      st.count = m.sessions.length;
      if (st.count === 0) return finish('NO_SESSIONS');
      const valid = new Set(['cockpit', 'cli', 'scheduler', 'tech']);
      st.catsOk = m.sessions.every((s) => valid.has(s.category));
      const byCat = {};
      for (const s of m.sessions) byCat[s.category] = (byCat[s.category] ?? 0) + 1;
      console.log('categorie:', JSON.stringify(byCat), '| tutte valide:', st.catsOk);
      console.log('prime 3:', m.sessions.slice(0, 3).map((s) => `${s.sessionId.slice(0, 8)} [${s.category}] "${s.summary.slice(0, 40)}"`).join(' | '));
      st.chosen = (m.sessions[1] ?? m.sessions[0]).sessionId;
      send({ op: 'session_open', project: home, sessionId: st.chosen });
      break;
    }
    case 'session_opened': {
      st.openedEv = m.sessionId === st.chosen;
      const map = existsSync(storePath) ? JSON.parse(readFileSync(storePath, 'utf8')) : {};
      st.storeOk = map[home] === st.chosen;
      send({ op: 'history', project: home });
      break;
    }
    case 'history':
      st.history = m.messages.length;
      finish('done');
      break;
    case 'error':
      console.log('ERROR:', m.message);
      break;
  }
});
