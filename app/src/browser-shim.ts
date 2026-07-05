// Shim per l'uso da browser (UI servita dall'engine, es. via Tailscale dal telefono):
// fuori da Electron window.cockpit non esiste — qui il token arriva da ?token= o da un prompt,
// e resta in localStorage. Notifiche/config sono best-effort locali.
import { t as tr } from './strings';

if (typeof window !== 'undefined' && !window.cockpit) {
  const KEY = 'cockpit-token';
  const fromUrl = new URLSearchParams(location.search).get('token');
  if (fromUrl) {
    localStorage.setItem(KEY, fromUrl);
    history.replaceState(null, '', location.pathname); // non lasciare il token nella barra URL
  }
  window.cockpit = {
    getToken: async () => {
      let t = localStorage.getItem(KEY);
      if (!t) {
        t = prompt(tr('tokenPrompt'))?.trim() ?? null;
        if (t) localStorage.setItem(KEY, t);
      }
      return t;
    },
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
  };
}

export {};
