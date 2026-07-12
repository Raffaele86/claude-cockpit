// Agente ConPTY Windows: riceve comandi JSON (newline-delimited) su stdin, possiede un ConPTY
// (node-pty prebuilt) per claude/shell, rimanda i byte del terminale su stdout come {t:'data',d:base64}.
// Lanciato dall'engine WSL via interop con stdio a pipe. Un agente = una sessione (un tab).
const pty = require('@homebridge/node-pty-prebuilt-multiarch');
let term = null;
function send(o) { try { process.stdout.write(JSON.stringify(o) + '\n'); } catch {} }
let buf = '';
process.stdin.on('data', (c) => {
  buf += c.toString('utf8');
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    try {
      if (m.t === 'spawn' && !term) {
        term = pty.spawn(m.file, m.args || [], {
          name: 'xterm-256color', cols: m.cols || 80, rows: m.rows || 24,
          cwd: m.cwd, env: Object.assign({}, process.env, m.env || {}),
        });
        term.onData((d) => send({ t: 'data', d: Buffer.from(d, 'utf8').toString('base64') }));
        term.onExit((e) => { send({ t: 'exit', code: e.exitCode }); process.exit(0); });
        send({ t: 'ready', pid: term.pid });
      } else if (m.t === 'input' && term) {
        term.write(Buffer.from(m.d, 'base64').toString('utf8'));
      } else if (m.t === 'resize' && term) {
        term.resize(m.cols, m.rows);
      } else if (m.t === 'kill' && term) {
        term.kill();
      }
    } catch (err) { send({ t: 'err', m: String(err) }); }
  }
});
process.stdin.on('end', () => { try { term && term.kill(); } catch {} process.exit(0); });
