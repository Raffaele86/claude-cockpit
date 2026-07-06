import { useEffect, useRef, type MutableRefObject } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { CockpitClient } from '../ws';
import type { PtyLaunch, ServerMsg } from '../protocol';

interface Props {
  client: CockpitClient;
  project: string;
  cmd: 'claude' | 'shell';
  subscribe: (fn: (m: ServerMsg) => void) => () => void;
  /** Flag di lancio (provider/model/effort/mode): con questo il pty viene RICREATO coi flag. */
  launch?: PtyLaunch;
  /** Iniezione testo nel pty (es. quick actions in vista CLI). */
  inputRef?: MutableRefObject<((text: string) => void) | null>;
  /** Il processo del pty è uscito (es. /exit) — la UI può offrire il riavvio. */
  onExit?: () => void;
}

const enc = new TextEncoder();
const toB64 = (s: string) => btoa(String.fromCharCode(...enc.encode(s)));
const fromB64 = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

export function TerminalPanel({ client, project, cmd, subscribe, launch, inputRef, onExit }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const term = new XTerm({
      fontFamily: 'Cascadia Code, Fira Code, ui-monospace, monospace',
      fontSize: 13,
      theme: { background: '#0c0e12', foreground: '#d7dce5' },
      cursorBlink: true,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    let ptyId: string | null = null;

    const unsub = subscribe((m: ServerMsg) => {
      if (m.ev === 'pty_attach_ok' && ptyId === null && m.project === project && m.cmd === cmd) {
        ptyId = m.ptyId;
        if (m.scrollback) term.write(fromB64(m.scrollback));
        if (inputRef) inputRef.current = (text) => client.send({ op: 'pty_input', ptyId: m.ptyId, data: toB64(text) });
        term.focus();
      } else if (m.ev === 'pty_data' && m.ptyId === ptyId) {
        term.write(fromB64(m.data));
      } else if (m.ev === 'pty_exit' && m.ptyId === ptyId) {
        term.write(`\r\n\x1b[90m[processo terminato: ${m.exitCode}]\x1b[0m\r\n`);
        onExit?.();
      }
    });

    // Attach: riusa il pty persistente della chiave (con replay scrollback) o lo crea;
    // con launch il pty viene ricreato coi flag richiesti (il -c riprende la conversazione).
    client.send({ op: 'pty_attach', project, cmd, cols: term.cols, rows: term.rows, launch });

    const dataDisp = term.onData((d) => {
      if (ptyId) client.send({ op: 'pty_input', ptyId, data: toB64(d) });
    });

    const onResize = () => {
      fit.fit();
      if (ptyId) client.send({ op: 'pty_resize', ptyId, cols: term.cols, rows: term.rows });
    };
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    return () => {
      // Detach senza kill: il pty resta vivo lato engine per il re-attach.
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      dataDisp.dispose();
      unsub();
      if (inputRef) inputRef.current = null;
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, cmd]);

  return <div className="terminal-host" ref={hostRef} />;
}
