const { app, BrowserWindow, ipcMain, session, Menu, Notification } = require('electron');
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

ipcMain.handle('get-token', () => readToken());
ipcMain.handle('start-engine', () => startEngine());
ipcMain.handle('notify', (_e, payload) => doNotify(payload || {}));
ipcMain.handle('get-config', () => readConfig());
ipcMain.handle('set-config', (_e, patch) => writeConfig(patch || {}));

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
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
