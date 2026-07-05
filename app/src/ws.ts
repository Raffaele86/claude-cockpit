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
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.ws?.close();
    this.ws = null;
  }

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
      setTimeout(() => this.connect(), delay);
    };

    ws.onerror = () => ws.close();
  }
}
