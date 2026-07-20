// Shim per l'uso da browser (UI servita dall'engine, es. via Tailscale dal telefono):
// fuori da Electron window.cockpit non esiste — qui il token arriva da ?token= o da un prompt,
// e resta in localStorage. Notifiche/config sono best-effort locali.
import { t as tr } from './strings';

/** true quando window.cockpit e' stato messo DA QUI, cioe' non c'era un preload
 *  Electron a fornirlo. E' il discriminante giusto per decidere se chiedere il
 *  token all'utente: lo user agent direbbe "Electron" anche quando l'app gira in
 *  una finestra senza preload, e in Electron vero il token lo passa il processo
 *  principale — se manca la' e' un guasto, non una richiesta di accesso. */
export const USING_SHIM = typeof window !== 'undefined' && !window.cockpit;

if (USING_SHIM) {
  const KEY = 'cockpit-token';
  // Il fragment (#token=...) non viene mai inviato al server: preferito alla query string,
  // che finisce nei log di qualunque reverse proxy davanti all'engine.
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('token');
  const fromUrl = fromHash ?? new URLSearchParams(location.search).get('token');
  if (fromUrl) {
    localStorage.setItem(KEY, fromUrl);
    history.replaceState(null, '', location.pathname); // non lasciare il token nella barra URL
  }
  window.cockpit = {
    // Nessun prompt() nativo: se il token non c'e' si restituisce null e l'app
    // mostra la sua schermata di accesso (AuthGate). Il prompt era la PRIMA cosa
    // che il Cockpit mostrava dal telefono, e non era disegnabile ne' capace di
    // dire dove si prende il token o che quello inserito era sbagliato.
    getToken: async () => localStorage.getItem(KEY),
    startEngine: async () => ({ ok: false, error: tr('notFromBrowser') }),
    notify: async ({ title, body }) => {
      try {
        if (Notification.permission === 'default') await Notification.requestPermission();
        if (Notification.permission === 'granted') new Notification(title, { body });
      } catch {
        /* best effort */
      }
      return { ok: true };
    },
    getConfig: async () => ({ notify: true, notifyPhone: false, ntfyTopic: '' }),
    setConfig: async () => ({ notify: true, notifyPhone: false, ntfyTopic: '' }),
    doctor: async () => ({ platform: 'browser', checks: [] }),
    updateRun: async () => ({ mode: 'manual', newer: false }),
    updateInstall: async () => ({ ok: false }),
    onUpdateState: () => {},
  };
}

export {};
