import pty from 'node-pty';
import type { IPty } from 'node-pty';

/** Un canale PTY: login shell nella cwd del progetto, opzionalmente lancia `claude`. */
export class PtyChannel {
  private readonly p: IPty;

  constructor(
    cwd: string,
    cmd: 'claude' | 'shell',
    cols: number,
    rows: number,
    onData: (b64: string) => void,
    onExit: (code: number) => void,
  ) {
    const shell = process.env.SHELL || '/bin/bash';
    // Login shell → eredita PATH del profilo (claude sta in ~/.local/bin).
    const args = cmd === 'claude' ? ['-lc', 'exec claude'] : ['-l'];
    this.p = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: process.env as { [key: string]: string },
    });
    this.p.onData((data) => onData(Buffer.from(data, 'utf8').toString('base64')));
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
}
