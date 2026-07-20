import { useEffect, useRef, type MutableRefObject } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
// xterm.css NON si importa qui: importato da un modulo TS il suo ordine rispetto
// al nostro foglio non e' garantito da Vite fra dev e build (causa classica di
// "il terminale si scassa solo dopo la build"). Sta in theme.css, in @layer vendor,
// cosi' i nostri override vincono sempre in modo deterministico.
import { xtermTheme, xtermFont } from '../term-theme';
import type { CockpitClient } from '../ws';
import type { PtyLaunch, ServerMsg } from '../protocol';

interface Props {
  client: CockpitClient;
  project: string;
  cmd: 'claude' | 'shell';
  /** 'windows' = esegui claude/shell su Windows nativo (ponte ConPTY) invece che in WSL. */
  os?: 'windows';
  subscribe: (fn: (m: ServerMsg) => void) => () => void;
  /** Chiamata UNA volta all'attach: flag di lancio pendenti (provider/model/effort/mode) → il pty
   *  viene ricreato coi flag. One-shot: i mount successivi (cambio scheda) non toccano il processo. */
  takeLaunch?: () => PtyLaunch | undefined;
  /** Chiamata al momento dell'attach: true = chiedi un pty pulito (sessione nuova). */
  takeFresh?: () => boolean;
  /** Iniezione testo nel pty (es. quick actions in vista CLI). */
  inputRef?: MutableRefObject<((text: string) => void) | null>;
  /** Il processo del pty è uscito (es. /exit) — la UI può offrire il riavvio. */
  onExit?: () => void;
}

const enc = new TextEncoder();
const toB64 = (s: string) => btoa(String.fromCharCode(...enc.encode(s)));
const fromB64 = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

export function TerminalPanel({ client, project, cmd, os, subscribe, takeLaunch, takeFresh, inputRef, onExit }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const term = new XTerm({
      ...xtermFont(),
      theme: xtermTheme(),
      cursorBlink: true,
      scrollback: 5000,
      lineHeight: 1.25,
      fontWeight: 400,
      fontWeightBold: 700,
      // il grassetto dev'essere PESO, non un cambio di tinta: col default xterm
      // ogni testo in grassetto saltava sul colore "bright" corrispondente
      drawBoldTextInBrightColors: false,
      // niente ritocchi automatici: la palette e' deliberata
      minimumContrastRatio: 1,
      cursorStyle: coarse ? 'bar' : 'block',
      cursorInactiveStyle: 'outline',
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
    // launch/fresh sono one-shot (consumati qui): un semplice cambio scheda rimonta il
    // Terminal ma fa attach puro — il processo in corso non viene MAI toccato.
    const launch = takeLaunch?.();
    const fresh = (!launch && takeFresh?.()) || undefined;
    client.send({ op: 'pty_attach', project, cmd, os, cols: term.cols, rows: term.rows, launch, fresh });

    const dataDisp = term.onData((d) => {
      if (ptyId) client.send({ op: 'pty_input', ptyId, data: toB64(d) });
    });

    const onResize = () => {
      fit.fit();
      if (ptyId) client.send({ op: 'pty_resize', ptyId, cols: term.cols, rows: term.rows });
    };
    window.addEventListener('resize', onResize);
    // Su Android l'apertura della tastiera ridimensiona il VISUAL viewport senza
    // far scattare window.resize in modo affidabile: senza questo fit.fit() non
    // gira, le righe del pty restano quelle vecchie e la TUI si ridisegna sopra
    // se' stessa. E' il difetto piu' fastidioso nell'uso dal telefono.
    window.visualViewport?.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    return () => {
      // Detach senza kill: il pty resta vivo lato engine per il re-attach.
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      ro.disconnect();
      dataDisp.dispose();
      unsub();
      if (inputRef) inputRef.current = null;
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, cmd, os]);

  return <div className="terminal-host" ref={hostRef} />;
}
