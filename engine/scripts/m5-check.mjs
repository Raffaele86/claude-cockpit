// Verifica M5: pty shell (echo marker deterministico) + pty claude (produce output/banner).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const token = readFileSync(join(homedir(), '.claude-cockpit', 'token'), 'utf8').trim();
const home = homedir();
const ws = new WebSocket('ws://127.0.0.1:8130');
const send = (m) => ws.send(JSON.stringify(m));
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const deB64 = (s) => Buffer.from(s, 'base64').toString('utf8');

const st = { shellPty: null, claudePty: null, shellBuf: '', claudeBytes: 0, markerSeen: false, claudeOutput: false, phase: 'shell' };
const deadline = setTimeout(() => finish('TIMEOUT'), 60_000);

function finish(reason) {
  clearTimeout(deadline);
  console.log('--- ESITO M5 ---');
  console.log(`shell marker (COCKPIT_PTY_MARKER_42) visto: ${st.markerSeen}`);
  console.log(`claude pty ha prodotto output (${st.claudeBytes} byte): ${st.claudeOutput}`);
  const ok = st.markerSeen && st.claudeOutput;
  console.log(`reason=${reason} PASS=${ok}`);
  if (st.shellPty) send({ op: 'pty_close', ptyId: st.shellPty });
  if (st.claudePty) send({ op: 'pty_close', ptyId: st.claudePty });
  setTimeout(() => { ws.close(); process.exit(ok ? 0 : 2); }, 200);
}

ws.on('open', () => send({ op: 'auth', token }));

ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  switch (m.ev) {
    case 'auth_ok':
      send({ op: 'pty_open', project: home, cmd: 'shell', cols: 80, rows: 24 });
      break;
    case 'pty_open_ok':
      if (st.phase === 'shell') {
        st.shellPty = m.ptyId;
        setTimeout(() => send({ op: 'pty_input', ptyId: st.shellPty, data: b64('echo COCKPIT_PTY_MARKER_$((6*7))\r') }), 600);
      } else {
        st.claudePty = m.ptyId;
      }
      break;
    case 'pty_data':
      if (m.ptyId === st.shellPty) {
        st.shellBuf += deB64(m.data);
        if (!st.markerSeen && st.shellBuf.includes('COCKPIT_PTY_MARKER_42')) {
          st.markerSeen = true;
          // passa alla fase claude
          st.phase = 'claude';
          send({ op: 'pty_open', project: home, cmd: 'claude', cols: 80, rows: 24 });
        }
      } else if (m.ptyId === st.claudePty) {
        st.claudeBytes += deB64(m.data).length;
        if (st.claudeBytes > 20 && !st.claudeOutput) {
          st.claudeOutput = true;
          setTimeout(() => finish('done'), 400);
        }
      }
      break;
    case 'pty_exit':
      console.log(`[pty_exit] ${m.ptyId} code=${m.exitCode}`);
      break;
    case 'error':
      console.log(`[error] ${m.message}`);
      break;
  }
});

ws.on('error', (e) => {
  console.error('[M5] WS', e.message);
  process.exit(1);
});
