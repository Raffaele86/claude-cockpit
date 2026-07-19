export {};

interface CockpitConfig {
  notify: boolean;
  notifyPhone: boolean;
  ntfyTopic: string;
}

declare global {
  interface UpdateState {
    phase: 'checking' | 'available' | 'downloading' | 'ready' | 'uptodate' | 'error';
    version?: string;
    percent?: number;
    error?: string;
  }

  interface UpdateRunResult {
    mode: 'auto' | 'manual';
    newer?: boolean;
    latest?: string;
    url?: string;
    error?: string;
  }

  interface Window {
    cockpit: {
      getToken: () => Promise<string | null>;
      startEngine: () => Promise<{ ok: boolean; error?: string }>;
      notify: (payload: { title: string; body?: string; phone?: boolean }) => Promise<{ ok: boolean }>;
      getConfig: () => Promise<CockpitConfig>;
      setConfig: (patch: Partial<CockpitConfig>) => Promise<CockpitConfig>;
      doctor: () => Promise<{ platform: string; checks: { id: string; ok: boolean; detail: string }[] }>;
      updateRun: () => Promise<UpdateRunResult>;
      updateInstall: () => Promise<{ ok: boolean; error?: string }>;
      onUpdateState: (cb: (state: UpdateState) => void) => void;
      /** Copia via IPC (modulo clipboard di Electron). Assente nel browser-shim. */
      copyText?: (text: string) => Promise<boolean>;
      /** true SOLO alla prima apertura dopo un riavvio-da-update: le schede ri-attaccano i pty vivi. */
      updateRelaunch?: boolean;
    };
  }
}
