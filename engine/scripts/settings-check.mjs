// Verifica v0.8: settings_get/settings_set su un'istanza engine ISOLATA
// (COCKPIT_DIR temporaneo + porta 8131) — i file reali dell'utente non vengono toccati.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const dir = mkdtempSync(join(tmpdir(), 'cockpit-settings-'));
// Segreto pre-esistente: la sentinella mascherata NON deve sovrascriverlo.
writeFileSync(join(dir, 'telegram.json'), JSON.stringify({ botToken: 'SECRET-ORIGINALE-9999', chatId: 42 }), { mode: 0o600 });
// Chiave ignota a settings.ts (originHosts, letta solo da server.ts): un settings_set sull'engine
// non deve cancellarla — regressione B1 (applySettings sovrascriveva engine.json da zero).
writeFileSync(join(dir, 'engine.json'), JSON.stringify({ hosts: ['127.0.0.1'], originHosts: ['sentinel.example.ts.net'] }));

const engine = spawn('node', [join(import.meta.dirname, '..', 'dist', 'server.js')], {
  env: { ...process.env, COCKPIT_DIR: dir, COCKPIT_PORT: '8131' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
engine.stderr.on('data', (d) => process.stderr.write(d));

const st = { masked: false, keepSecret: false, newToken: false, qa: false, mode600: false, originHosts: false };
const finish = (reason) => {
  console.log('--- ESITO settings ---');
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
const ws = new WebSocket('ws://127.0.0.1:8131');
const send = (m) => ws.send(JSON.stringify(m));

let phase = 'get';
ws.on('open', () => send({ op: 'auth', token }));
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.ev === 'auth_ok') send({ op: 'settings_get' });
  if (m.ev !== 'settings') return;
  if (phase === 'get') {
    st.masked = m.data.telegram.botToken?.startsWith('••••') && m.data.telegram.botToken.endsWith('9999');
    phase = 'set-masked';
    // Rimanda il valore mascherato (= non toccare) cambiando solo il chatId.
    send({ op: 'settings_set', patch: { telegram: { ...m.data.telegram, chatId: 77 }, quickactions: [{ label: 'Test', text: 'ping' }] } });
  } else if (phase === 'set-masked') {
    const onDisk = JSON.parse(readFileSync(join(dir, 'telegram.json'), 'utf8'));
    st.keepSecret = onDisk.botToken === 'SECRET-ORIGINALE-9999' && onDisk.chatId === 77;
    st.mode600 = (statSync(join(dir, 'telegram.json')).mode & 0o777) === 0o600;
    st.qa = existsSync(join(dir, 'quickactions.json')) && JSON.parse(readFileSync(join(dir, 'quickactions.json'), 'utf8'))[0]?.label === 'Test';
    phase = 'set-new';
    send({ op: 'settings_set', patch: { telegram: { botToken: 'NUOVO-TOKEN-1234', chatId: 77 } } });
  } else if (phase === 'set-new') {
    const onDisk = JSON.parse(readFileSync(join(dir, 'telegram.json'), 'utf8'));
    st.newToken = onDisk.botToken === 'NUOVO-TOKEN-1234' && m.data.telegram.botToken === '••••1234';
    phase = 'set-engine';
    send({ op: 'settings_set', patch: { engine: { hosts: ['127.0.0.1'] } } });
  } else if (phase === 'set-engine') {
    const onDisk = JSON.parse(readFileSync(join(dir, 'engine.json'), 'utf8'));
    st.originHosts = JSON.stringify(onDisk.originHosts) === JSON.stringify(['sentinel.example.ts.net']);
    finish('done');
  }
});
