export {};

interface CockpitConfig {
  notify: boolean;
  notifyPhone: boolean;
  ntfyTopic: string;
}

declare global {
  interface Window {
    cockpit: {
      getToken: () => Promise<string | null>;
      startEngine: () => Promise<{ ok: boolean; error?: string }>;
      notify: (payload: { title: string; body?: string; phone?: boolean }) => Promise<{ ok: boolean }>;
      getConfig: () => Promise<CockpitConfig>;
      setConfig: (patch: Partial<CockpitConfig>) => Promise<CockpitConfig>;
    };
  }
}
