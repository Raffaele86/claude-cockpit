const { app, BrowserWindow, ipcMain, session, Menu, Notification, dialog, shell } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');

// WSL mirrored networking: 127.0.0.1 è condiviso, l'app Windows raggiunge l'engine su localhost.
const WSL_DISTRO = process.env.COCKPIT_WSL_DISTRO || 'Ubuntu';

/** Utente WSL: env override, altrimenti autodetect (whoami dentro la distro). */
function detectWslUser() {
  if (process.env.COCKPIT_WSL_USER) return process.env.COCKPIT_WSL_USER;
  if (process.platform !== 'win32') return '';
  try {
    return execFileSync('wsl.exe', ['-d', WSL_DISTRO, '-e', 'whoami'], { timeout: 5000 })
      .toString()
      .replace(/\0/g, '')
      .trim();
  } catch {
    return '';
  }
}
const WSL_USER = detectWslUser();

/** Candidati per il token: diretto se giriamo in WSL, via \\wsl$ se giriamo su Windows. */
function tokenCandidates() {
  if (process.platform === 'win32') {
    const rel = `home\\${WSL_USER}\\.claude-cockpit\\token`;
    return [`\\\\wsl.localhost\\${WSL_DISTRO}\\${rel}`, `\\\\wsl$\\${WSL_DISTRO}\\${rel}`];
  }
  return [join(homedir(), '.claude-cockpit', 'token')];
}

function readToken() {
  for (const p of tokenCandidates()) {
    try {
      if (existsSync(p)) return readFileSync(p, 'utf8').trim();
    } catch {
      /* prova il prossimo candidato */
    }
  }
  return null;
}

/** Base dir ~/.claude-cockpit (locale in WSL, UNC \\wsl$ su Windows). */
function cockpitDir() {
  if (process.platform === 'win32') {
    const bases = [
      `\\\\wsl.localhost\\${WSL_DISTRO}\\home\\${WSL_USER}\\.claude-cockpit`,
      `\\\\wsl$\\${WSL_DISTRO}\\home\\${WSL_USER}\\.claude-cockpit`,
    ];
    return bases.find((b) => existsSync(b)) ?? bases[0];
  }
  return join(homedir(), '.claude-cockpit');
}

const CONFIG_DEFAULT = { notify: true, notifyPhone: false, ntfyTopic: '' }; // ntfy: opt-in via config.json

function readConfig() {
  try {
    const p = join(cockpitDir(), 'config.json');
    if (existsSync(p)) return { ...CONFIG_DEFAULT, ...JSON.parse(readFileSync(p, 'utf8')) };
  } catch {
    /* fallback default */
  }
  return { ...CONFIG_DEFAULT };
}

function writeConfig(patch) {
  const merged = { ...readConfig(), ...patch };
  try {
    writeFileSync(join(cockpitDir(), 'config.json'), JSON.stringify(merged, null, 2) + '\n');
  } catch {
    /* best effort */
  }
  return merged;
}

/** Notifica desktop + (opz) push ntfy al telefono. La POST gira nel main per bypassare la CSP. */
async function doNotify({ title, body, phone }) {
  const cfg = readConfig();
  if (!cfg.notify) return { ok: false, reason: 'disabled' };
  try {
    if (Notification.isSupported()) new Notification({ title, body }).show();
  } catch {
    /* desktop notification best effort */
  }
  if (phone && cfg.notifyPhone && cfg.ntfyTopic) {
    try {
      await fetch(`https://ntfy.sh/${cfg.ntfyTopic}`, {
        method: 'POST',
        headers: { Title: 'Claude Cockpit', Tags: 'robot' },
        body: `${title}\n${body ?? ''}`.trim(),
      });
    } catch {
      /* rete assente: ignora */
    }
  }
  return { ok: true };
}

/** Avvia l'engine come systemd user service (Windows→wsl.exe; WSL→systemctl diretto). */
function startEngine() {
  return new Promise((resolve) => {
    const cmd =
      process.platform === 'win32'
        ? ['wsl.exe', ['-d', WSL_DISTRO, '--', 'systemctl', '--user', 'start', 'claude-cockpit-engine']]
        : ['systemctl', ['--user', 'start', 'claude-cockpit-engine']];
    const child = spawn(cmd[0], cmd[1], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => resolve({ ok: false, error: err.message }));
    child.on('close', (code) => resolve(code === 0 ? { ok: true } : { ok: false, error: stderr.trim() || `exit ${code}` }));
  });
}

/** Un check del doctor: esegue un comando e riporta esito + output (mai eccezioni). */
function check(id, cmd, args, validate) {
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
      let out = '';
      child.stdout.on('data', (d) => (out += d.toString()));
      child.stderr.on('data', (d) => (out += d.toString()));
      child.on('error', (err) => resolve({ id, ok: false, detail: err.message }));
      child.on('close', (code) => {
        const detail = out.replace(/\0/g, '').trim().split('\n')[0] || `exit ${code}`;
        const ok = code === 0 && (!validate || validate(out.replace(/\0/g, '')));
        resolve({ id, ok, detail });
      });
    } catch (err) {
      resolve({ id, ok: false, detail: String(err) });
    }
  });
}

/** Il WS dell'engine risponde su 127.0.0.1:8130? */
function checkPort() {
  return new Promise((resolve) => {
    const net = require('node:net');
    const sock = net.connect({ host: '127.0.0.1', port: 8130, timeout: 3000 });
    sock.on('connect', () => { sock.destroy(); resolve({ id: 'port', ok: true, detail: '127.0.0.1:8130' }); });
    sock.on('timeout', () => { sock.destroy(); resolve({ id: 'port', ok: false, detail: 'timeout 127.0.0.1:8130' }); });
    sock.on('error', (err) => resolve({ id: 'port', ok: false, detail: err.message }));
  });
}

/** Doctor: verifica i prerequisiti della macchina (WSL/Node/Claude CLI/engine/porta). */
async function runDoctor() {
  const inWsl = (args) => ['wsl.exe', ['-d', WSL_DISTRO, '-e', 'bash', '-lc', args]];
  const sh = (args) => ['bash', ['-lc', args]];
  const nodeOk = (out) => Number((out.match(/v(\d+)/) || [])[1] || 0) >= 20;
  const checks = [];
  if (process.platform === 'win32') {
    checks.push(await check('wsl', 'wsl.exe', ['--status']));
    checks.push({ id: 'wsluser', ok: !!WSL_USER, detail: WSL_USER || 'utente WSL non rilevato' });
    checks.push(await check('node', ...inWsl('node --version'), nodeOk));
    checks.push(await check('claude', ...inWsl('claude --version')));
    checks.push(await check('engine', ...inWsl('systemctl --user is-active claude-cockpit-engine'), (o) => o.includes('active')));
  } else {
    checks.push(await check('node', ...sh('node --version'), nodeOk));
    checks.push(await check('claude', ...sh('claude --version')));
    checks.push(
      process.platform === 'darwin'
        ? await check('engine', ...sh('launchctl list | grep -q claude-cockpit && echo loaded'))
        : await check('engine', 'systemctl', ['--user', 'is-active', 'claude-cockpit-engine'], (o) => o.includes('active')),
    );
  }
  checks.push(await checkPort());
  return { platform: process.platform, checks };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: '#0f1115',
    title: 'Claude Cockpit',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Menù contestuale tasto destro (Electron non lo ha di default): copia della selezione,
  // taglia/incolla nei campi editabili — es. copiare porzioni di testo dal lettore Markdown.
  win.webContents.on('context-menu', (_e, params) => {
    const items = [];
    if (params.selectionText) items.push({ role: 'copy' });
    if (params.isEditable) items.push({ role: 'cut' }, { role: 'paste' });
    if (params.selectionText || params.isEditable) items.push({ type: 'separator' }, { role: 'selectAll' });
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });

  // Log della console del renderer su stdout del main (debug + verifica smoke).
  // Electron 43 passa un oggetto evento (.message); vecchie versioni passavano (e, level, message).
  win.webContents.on('console-message', (e, _level, message) => {
    process.stdout.write(`[renderer] ${message ?? e?.message ?? ''}\n`);
  });

  const devUrl = process.env.COCKPIT_RENDERER_URL;
  // COCKPIT_SMOKE: '1' → chat; altrimenti stringa query completa (es. "smoke=edit&dir=/path").
  const raw = process.env.COCKPIT_SMOKE;
  const smokeQuery = raw ? (raw === '1' ? 'smoke=1' : raw) : '';
  if (devUrl) {
    win.loadURL(devUrl + (smokeQuery ? '?' + smokeQuery : ''));
  } else {
    win.loadFile(join(__dirname, '..', 'dist', 'index.html'), smokeQuery ? { search: smokeQuery } : undefined);
  }
}

// Auto-update: install nsis su Windows → electron-updater (GitHub Releases);
// portable e mac (zip non firmata) non possono auto-applicare l'update → solo avviso con link.
// Mai bloccante: offline o API giù = silenzio.
function setupAutoUpdate() {
  if (!app.isPackaged) return;
  const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;
  if (process.platform === 'win32' && !isPortable) {
    try {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.on('error', (err) => process.stdout.write(`[updater] ${err?.message || err}\n`));
      autoUpdater.on('update-downloaded', (info) => {
        dialog.showMessageBox({
          type: 'info',
          buttons: ['Restart now', 'Later'],
          defaultId: 0,
          message: `Update v${info.version} ready`,
          detail: 'It will be installed when the app restarts.',
        }).then((r) => { if (r.response === 0) autoUpdater.quitAndInstall(); });
      });
      autoUpdater.checkForUpdates().catch(() => {});
    } catch { /* electron-updater non pacchettizzato: nessun auto-update */ }
    return;
  }
  fetch('https://api.github.com/repos/Raffaele86/claude-cockpit/releases/latest', {
    headers: { accept: 'application/vnd.github+json' },
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((rel) => {
      const latest = rel?.tag_name?.replace(/^v/, '');
      const current = app.getVersion();
      if (!latest || latest.localeCompare(current, undefined, { numeric: true }) <= 0) return;
      dialog.showMessageBox({
        type: 'info',
        buttons: ['Open download page', 'Ignore'],
        defaultId: 0,
        message: `Claude Cockpit v${latest} is available`,
        detail: 'This build cannot update itself — download the new version from the releases page.',
      }).then((r) => { if (r.response === 0) shell.openExternal(rel.html_url); });
    })
    .catch(() => {});
}

ipcMain.handle('get-token', () => readToken());
ipcMain.handle('start-engine', () => startEngine());
ipcMain.handle('notify', (_e, payload) => doNotify(payload || {}));
ipcMain.handle('get-config', () => readConfig());
ipcMain.handle('set-config', (_e, patch) => writeConfig(patch || {}));
ipcMain.handle('doctor', () => runDoctor());

app.whenReady().then(() => {
  // Microfono per la dettatura (Whisper via engine): consenti esplicitamente il permesso media.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media');
  });
  // CSP nel pacchetto (file://): consenti solo self + WS localhost verso l'engine.
  // In dev (COCKPIT_RENDERER_URL) niente CSP, così Vite HMR non si rompe.
  if (!process.env.COCKPIT_RENDERER_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; connect-src 'self' ws://127.0.0.1:8130; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'",
          ],
        },
      });
    });
  }
  createWindow();
  setupAutoUpdate();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
