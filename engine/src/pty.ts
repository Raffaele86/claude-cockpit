import pty from 'node-pty';
import type { IPty } from 'node-pty';

const SCROLLBACK_CAP = 200 * 1024; // byte di output conservati per il re-attach

/** Un canale PTY: login shell nella cwd del progetto, opzionalmente lancia `claude`.
 *  Persistente: conserva lo scrollback così un client può ri-attaccarsi dopo reload/cambio scheda. */
export class PtyChannel {
  private readonly p: IPty;
  private chunks: Buffer[] = [];
  private bufBytes = 0;
  /** Timestamp spawn: serve a capire se una conversazione è nata in QUESTA scheda. */
  readonly startedAt = Date.now();
  /** CLAUDE_CONFIG_DIR con cui è partito claude (undefined = ~/.claude): lo store delle sue conversazioni. */
  readonly configDir?: string;

  constructor(
    cwd: string,
    cmd: 'claude' | 'shell',
    cols: number,
    rows: number,
    onData: (b64: string) => void,
    onExit: (code: number) => void,
    opts: { extraArgs?: string[]; env?: Record<string, string> } = {},
  ) {
    this.configDir = opts.env?.CLAUDE_CONFIG_DIR;
    const shell = process.env.SHELL || '/bin/bash';
    // Login shell → eredita PATH del profilo (claude sta in ~/.local/bin).
    // extraArgs (es. --permission-mode plan, -c) quotati singolarmente.
    const quoted = (opts.extraArgs ?? []).map((a) => `'${a.replaceAll("'", "'\\''")}'`).join(' ');
    const args = cmd === 'claude' ? ['-lc', `exec claude ${quoted}`.trim()] : ['-l'];
    this.p = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: { ...(process.env as { [key: string]: string }), ...(opts.env ?? {}) },
    });
    this.p.onData((data) => {
      const buf = Buffer.from(data, 'utf8');
      this.chunks.push(buf);
      this.bufBytes += buf.length;
      while (this.bufBytes > SCROLLBACK_CAP && this.chunks.length > 1) {
        this.bufBytes -= this.chunks.shift()!.length;
      }
      onData(buf.toString('base64'));
    });
    this.p.onExit(({ exitCode }) => onExit(exitCode));
  }

  write(b64: string): void {
    this.p.write(Buffer.from(b64, 'base64').toString('utf8'));
  }

  resize(cols: number, rows: number): void {
    try {
      this.p.resize(cols, rows);
    } catch {
      /* pty già chiuso */
    }
  }

  kill(): void {
    try {
      this.p.kill();
    } catch {
      /* già morto */
    }
  }

  /** Output accumulato (base64) da riprodurre al re-attach. */
  scrollback(): string {
    return Buffer.concat(this.chunks).toString('base64');
  }
}
