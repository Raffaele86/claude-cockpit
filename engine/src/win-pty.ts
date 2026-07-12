// Canale PTY che esegue claude/shell su WINDOWS nativo, non in WSL. Spawna l'agente ConPTY
// (engine/win-agent/agent.cjs, con node-pty prebuilt) tramite il node.exe di Windows via interop,
// stdio a pipe, e fa da ponte con lo STESSO contratto di PtyChannel (write/resize/kill/scrollback
// + callback onData/onExit) così server.ts lo tratta come un pty qualsiasi.
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COCKPIT_DIR } from './auth.js';

const SCROLLBACK_CAP = 200 * 1024;

export interface WinAgentConfig {
  node: string; // path Windows di node.exe (esegue l'agente)
  agent: string; // path Windows di agent.cjs
  claude: string; // path Windows di claude.exe
}

/** Config del ponte Windows, scritta da build-raffa.sh in ~/.claude-cockpit/win-agent.json.
 *  Assente = feature Windows non installata (la UI la disabilita). */
export function loadWinAgent(): WinAgentConfig | null {
  try {
    const cfg = JSON.parse(readFileSync(join(COCKPIT_DIR, 'win-agent.json'), 'utf8')) as WinAgentConfig;
    if (cfg.node && cfg.agent && cfg.claude) return cfg;
  } catch {
    /* file assente/non valido */
  }
  return null;
}

/** cwd WSL → path Windows per l'agente (\\wsl.localhost\... per i progetti WSL, C:\… per /mnt/*). */
function toWinPath(cwd: string): string {
  try {
    return execFileSync('wslpath', ['-w', cwd]).toString().trim();
  } catch {
    return cwd;
  }
}

/** path Windows (C:\…) → path WSL (/mnt/c/…): il spawn di Linux esegue il .exe via interop
 *  solo con un path WSL, non con "C:\…". */
function toWslPath(winPath: string): string {
  try {
    return execFileSync('wslpath', ['-u', winPath]).toString().trim();
  } catch {
    return winPath;
  }
}

export class WinPtyChannel {
  private readonly p: ChildProcess;
  private chunks: Buffer[] = [];
  private bufBytes = 0;
  private lineBuf = '';
  private exited = false;
  readonly startedAt = Date.now();
  lastDataAt = 0;
  // Le sessioni Windows le gestisce claude di Windows: niente session-id/model/configDir lato cockpit.
  readonly sessionId: string | undefined = undefined;
  readonly model: string | undefined = undefined;
  readonly configDir: string | undefined = undefined;

  constructor(
    cwd: string,
    cmd: 'claude' | 'shell',
    cols: number,
    rows: number,
    onData: (b64: string) => void,
    onExit: (code: number) => void,
    cfg: WinAgentConfig,
  ) {
    const finish = (code: number) => {
      if (this.exited) return;
      this.exited = true;
      onExit(code);
    };
    // cfg.node è un path Windows in win-agent.json → per il spawn Linux serve il path WSL (/mnt/c/…).
    this.p = spawn(toWslPath(cfg.node), [cfg.agent], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.send({ t: 'spawn', file: cmd === 'claude' ? cfg.claude : 'powershell.exe', args: [], cwd: toWinPath(cwd), cols, rows });
    this.p.stdout!.on('data', (chunk: Buffer) => {
      this.lineBuf += chunk.toString('utf8');
      let nl: number;
      while ((nl = this.lineBuf.indexOf('\n')) >= 0) {
        const line = this.lineBuf.slice(0, nl);
        this.lineBuf = this.lineBuf.slice(nl + 1);
        if (!line.trim()) continue;
        let m: { t?: string; d?: string; code?: number };
        try {
          m = JSON.parse(line) as typeof m;
        } catch {
          continue;
        }
        if (m.t === 'data' && m.d) {
          this.lastDataAt = Date.now();
          const buf = Buffer.from(m.d, 'base64');
          this.chunks.push(buf);
          this.bufBytes += buf.length;
          while (this.bufBytes > SCROLLBACK_CAP && this.chunks.length > 1) this.bufBytes -= this.chunks.shift()!.length;
          onData(m.d); // già base64: il protocollo pty_data lo vuole così
        } else if (m.t === 'exit') {
          finish(m.code ?? 0);
        }
      }
    });
    this.p.stderr!.on('data', (d: Buffer) => console.error('[win-agent]', d.toString().trimEnd()));
    this.p.on('error', (err) => {
      console.error('[win-agent] spawn:', String(err));
      finish(1);
    });
    this.p.on('exit', (code) => finish(code ?? 0));
  }

  private send(obj: Record<string, unknown>): void {
    try {
      this.p.stdin!.write(JSON.stringify(obj) + '\n');
    } catch {
      /* agente già chiuso */
    }
  }

  write(b64: string): void {
    this.send({ t: 'input', d: b64 });
  }

  resize(cols: number, rows: number): void {
    this.send({ t: 'resize', cols, rows });
  }

  kill(): void {
    this.send({ t: 'kill' });
    try {
      this.p.kill();
    } catch {
      /* già morto */
    }
  }

  scrollback(): string {
    return Buffer.concat(this.chunks).toString('base64');
  }
}
