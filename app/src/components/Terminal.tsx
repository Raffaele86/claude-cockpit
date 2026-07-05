import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { CockpitClient } from '../ws';
import type { ServerMsg } from '../protocol';

interface Props {
  client: CockpitClient;
  project: string;
  cmd: 'claude' | 'shell';
  subscribe: (fn: (m: ServerMsg) => void) => () => void;
}

const enc = new TextEncoder();
const toB64 = (s: string) => btoa(String.fromCharCode(...enc.encode(s)));
const fromB64 = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

export function TerminalPanel({ client, project, cmd, subscribe }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const term = new XTerm({
      fontFamily: 'Cascadia Code, Fira Code, ui-monospace, monospace',
      fontSize: 13,
      theme: { background: '#0c0e12', foreground: '#d7dce5' },
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    let ptyId: string | null = null;

    const unsub = subscribe((m: ServerMsg) => {
      if (m.ev === 'pty_open_ok' && ptyId === null && m.project === project) {
        ptyId = m.ptyId;
      } else if (m.ev === 'pty_data' && m.ptyId === ptyId) {
        term.write(fromB64(m.data));
      } else if (m.ev === 'pty_exit' && m.ptyId === ptyId) {
        term.write(`\r\n\x1b[90m[processo terminato: ${m.exitCode}]\x1b[0m\r\n`);
      }
    });

    client.send({ op: 'pty_open', project, cmd, cols: term.cols, rows: term.rows });

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
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      dataDisp.dispose();
      unsub();
      if (ptyId) client.send({ op: 'pty_close', ptyId });
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, cmd]);

  return <div className="terminal-host" ref={hostRef} />;
}
