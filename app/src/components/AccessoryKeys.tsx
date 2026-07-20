import type { MutableRefObject } from 'react';
import { t } from '../strings';

/**
 * Barra dei tasti accessori del terminale, sopra la tastiera del telefono.
 *
 * Perche' serve: dal telefono il Cockpit apre sul terminale, ma la tastiera di
 * Android non ha Esc, Tab, frecce ne' Ctrl. Senza questi tasti meta' di quello
 * che si fa in una TUI e' semplicemente irraggiungibile — non scomodo,
 * irraggiungibile.
 *
 * Non serve nessuna modifica al protocollo: Terminal.tsx espone gia'
 * `inputRef.current(testo)` che finisce in `pty_input`, ed e' lo stesso canale
 * usato dalle azioni rapide.
 */

interface Tasto {
  label: string;
  /** Sequenza grezza inviata al pty. */
  seq: string;
  title?: string;
  wide?: boolean;
}

/** Un `Ctrl` appiccicoso che trasformi il tasto SUCCESSIVO della tastiera di
 *  sistema richiederebbe attachCustomKeyEventHandler su xterm. I cinque Ctrl
 *  espliciti qui sotto coprono quasi tutto a costo zero e senza rischi. */
const TASTI: Tasto[] = [
  { label: 'esc', seq: '\x1b', title: 'Escape' },
  { label: 'tab', seq: '\t' },
  { label: '⇧tab', seq: '\x1b[Z', title: 'Shift+Tab — cicla i modi permesso' },
  { label: '↑', seq: '\x1b[A' },
  { label: '↓', seq: '\x1b[B' },
  { label: '←', seq: '\x1b[D' },
  { label: '→', seq: '\x1b[C' },
  { label: '^C', seq: '\x03', title: 'Interrompi' },
  { label: '^D', seq: '\x04', title: 'Fine input' },
  { label: '^Z', seq: '\x1a', title: 'Sospendi' },
  { label: '^R', seq: '\x12', title: 'Ricerca nella cronologia' },
  { label: '^L', seq: '\x0c', title: 'Pulisci' },
  { label: '/', seq: '/' },
  { label: '|', seq: '|' },
  { label: '-', seq: '-' },
  { label: '~', seq: '~' },
  { label: '⏎', seq: '\r', wide: true },
];

export function AccessoryKeys({ inputRef }: { inputRef: MutableRefObject<((t: string) => void) | null> }) {
  return (
    <div className="acckeys" role="toolbar" aria-label={t('accKeysLabel')}>
      {TASTI.map((k) => (
        <button
          key={k.label}
          className={k.wide ? 'acckey wide' : 'acckey'}
          title={k.title ?? k.label}
          aria-label={k.title ?? k.label}
          // Il fuoco NON deve lasciare la textarea nascosta di xterm: senza
          // questo, ogni tocco chiuderebbe la tastiera. E' il dettaglio da cui
          // dipende tutta la barra.
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.(k.seq)}
        >
          {k.label}
        </button>
      ))}
    </div>
  );
}
