import type { ClientMsg, ServerMsg } from './protocol';

export type ConnState = 'connecting' | 'authed' | 'disconnected';

// Da browser il WS è same-origin: regge sia l'accesso diretto (http://IP:8130) sia un reverse
// proxy TLS davanti all'engine (es. `tailscale serve` → https://nome.ts.net → wss sulla 443).
// In Electron (file://) resta localhost.
const ENGINE_URL =
  location.protocol === 'https:'
    ? `wss://${location.host}`
    : location.protocol === 'http:' && location.host
      ? `ws://${location.host}`
      : 'ws://127.0.0.1:8130';
const MAX_BACKOFF_MS = 8000;

/** Client WS con auth automatica e riconnessione a backoff esponenziale. */
export class CockpitClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private backoff = 500;
  private stopped = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<(m: ServerMsg) => void>();

  constructor(
    private readonly onState: (s: ConnState) => void,
    private readonly onMessage: (m: ServerMsg) => void,
  ) {}

  /** Ascoltatore aggiuntivo per lo stesso stream (es. il pannello Terminale). */
  subscribe(fn: (m: ServerMsg) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  start(token: string): void {
    this.token = token;
    this.stopped = false;
    document.addEventListener('visibilitychange', this.onForeground);
    window.addEventListener('online', this.onForeground);
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    document.removeEventListener('visibilitychange', this.onForeground);
    window.removeEventListener('online', this.onForeground);
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  // Su mobile l'OS può uccidere la socket in background senza FIN pulito: onclose arriva
  // solo al timeout TCP. Al ritorno in foreground (o al recupero rete) forziamo una
  // riconnessione immediata invece di aspettare il backoff pendente.
  private readonly onForeground = (): void => {
    if (this.stopped) return;
    if (document.visibilityState !== 'visible') return;
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.ws?.readyState === WebSocket.CONNECTING) return;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.backoff = 500;
    this.connect();
  };

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private connect(): void {
    if (this.stopped) return;
    this.onState('connecting');
    const ws = new WebSocket(ENGINE_URL);
    this.ws = ws;

    ws.onopen = () => {
      if (this.token) ws.send(JSON.stringify({ op: 'auth', token: this.token } satisfies ClientMsg));
    };

    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data as string) as ServerMsg;
      } catch {
        return;
      }
      if (msg.ev === 'auth_ok') {
        this.backoff = 500;
        this.onState('authed');
      }
      this.onMessage(msg);
      for (const l of this.listeners) l(msg);
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.stopped) return;
      this.onState('disconnected');
      const delay = this.backoff;
      this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, delay);
    };

    ws.onerror = () => ws.close();
  }
}
