/**
 * Cattura schermate della UI buildata senza bisogno di un server DevTools:
 * Electron e' gia' Chromium, e con show:false + capturePage() lavora fuori schermo.
 *
 *   npx electron scripts/shot.cjs <url> <out.png> [larghezza] [altezza]
 *
 * Esempi:
 *   npx electron scripts/shot.cjs http://127.0.0.1:5173 /tmp/desk.png 1280 860
 *   npx electron scripts/shot.cjs http://127.0.0.1:5173 /tmp/tel.png   360 780
 */
const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');

const [url, out, w = '1280', h = '860'] = process.argv.slice(2);
if (!url || !out) {
  console.error('uso: electron scripts/shot.cjs <url> <out.png> [w] [h]');
  process.exit(2);
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: Number(w),
    height: Number(h),
    show: false,
    backgroundColor: '#1c1b19',
    webPreferences: { offscreen: false, backgroundThrottling: false },
  });

  // il prompt() del token bloccherebbe il caricamento fuori schermo
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript('window.prompt = () => null;').catch(() => {});
  });

  try {
    await win.loadURL(url);
  } catch (e) {
    console.error('caricamento fallito:', e.message);
    app.exit(1);
    return;
  }

  await new Promise((r) => setTimeout(r, 2500)); // font + primo render
  const img = await win.webContents.capturePage();
  writeFileSync(out, img.toPNG());
  console.log(`${out}  ${w}x${h}`);
  app.exit(0);
});
