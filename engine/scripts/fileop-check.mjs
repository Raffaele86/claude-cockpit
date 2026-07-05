// Verifica v0.5.3: file_op mkdir → rename → delete (in .smoke) + delete su dir non vuota = errore.
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const token = readFileSync(join(homedir(), '.claude-cockpit', 'token'), 'utf8').trim();
const base = join(homedir(), 'claude-cockpit', '.smoke');
mkdirSync(base, { recursive: true });
// dir non vuota per il test negativo
const fullDir = join(base, 'fileop-full');
mkdirSync(fullDir, { recursive: true });
writeFileSync(join(fullDir, 'x.txt'), 'x');

const ws = new WebSocket('ws://127.0.0.1:8130');
const send = (m) => ws.send(JSON.stringify(m));
const st = { mkdir: false, rename: false, del: false, fullErr: false };
const deadline = setTimeout(() => finish('TIMEOUT'), 20_000);

function finish(reason) {
  clearTimeout(deadline);
  rmSync(fullDir, { recursive: true, force: true });
  const ok = st.mkdir && st.rename && st.del && st.fullErr;
  console.log(`--- ESITO file_op --- mkdir:${st.mkdir} rename:${st.rename} delete:${st.del} delete-non-vuota=errore:${st.fullErr} | reason=${reason} PASS=${ok}`);
  process.exit(ok ? 0 : 2);
}

ws.on('open', () => send({ op: 'auth', token }));
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.ev === 'auth_ok') send({ op: 'file_op', kind: 'mkdir', path: base, newName: 'fileop-test' });
  if (m.ev !== 'file_op_done') return;
  if (m.kind === 'mkdir') {
    st.mkdir = !m.error;
    send({ op: 'file_op', kind: 'rename', path: join(base, 'fileop-test'), newName: 'fileop-renamed' });
  } else if (m.kind === 'rename') {
    st.rename = !m.error;
    send({ op: 'file_op', kind: 'delete', path: join(base, 'fileop-renamed') });
  } else if (m.kind === 'delete' && m.path.endsWith('fileop-renamed')) {
    st.del = !m.error;
    send({ op: 'file_op', kind: 'delete', path: fullDir });
  } else if (m.kind === 'delete' && m.path.endsWith('fileop-full')) {
    st.fullErr = Boolean(m.error);
    finish('done');
  }
});
