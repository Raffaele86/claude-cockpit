/**
 * Tema del terminale, derivato dai token del design system.
 *
 * Prima di questo file Terminal.tsx impostava SOLO background e foreground con
 * due esadecimali scritti a mano (#0c0e12 / #d7dce5): le 16 ANSI restavano
 * quelle di default di xterm e stonavano con tutto il resto, e il fondo del
 * terminale era un nero freddo mentre l'app e' calda. Il terminale e' la
 * superficie su cui si passa piu' tempo: era il posto peggiore dove avere una
 * palette scollegata.
 *
 * VINCOLO: xterm non legge il CSS, riceve un oggetto JS. Ogni token che consuma
 * deve quindi essere un ESADECIMALE LETTERALE in tokens.css —
 * getComputedStyle().getPropertyValue() restituisce un color-mix() NON risolto,
 * che xterm non sa interpretare. Per questo i --term-* sono dichiarati a parte
 * dai wash derivati con color-mix.
 */
import type { ITheme } from '@xterm/xterm';

const read = (name: string, fallbackless: string): string => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  // Nessun fallback silenzioso: un token mancante deve rompersi in modo visibile,
  // non produrre un colore plausibile e sbagliato (e' la lezione di --bg-soft).
  if (!v) console.warn(`[term-theme] token mancante: ${name}`);
  return v || fallbackless;
};

export function xtermTheme(): ITheme {
  const t = (n: string) => read(`--term-${n}`, '#ff00ff');
  return {
    background: t('bg'),
    foreground: t('fg'),
    cursor: t('cursor'),
    cursorAccent: t('cursor-accent'),
    selectionBackground: t('selection-bg'),

    black: t('black'),
    red: t('red'),
    green: t('green'),
    yellow: t('yellow'),
    blue: t('blue'),
    magenta: t('magenta'),
    cyan: t('cyan'),
    white: t('white'),

    brightBlack: t('bright-black'),
    brightRed: t('bright-red'),
    brightGreen: t('bright-green'),
    brightYellow: t('bright-yellow'),
    brightBlue: t('bright-blue'),
    brightMagenta: t('bright-magenta'),
    brightCyan: t('bright-cyan'),
    brightWhite: t('bright-white'),
  };
}

/** Famiglia e corpo del mono, dagli stessi token del resto dell'interfaccia:
 *  cosi' la dimensione sul telefono arriva dalla stessa media query di tutto il
 *  resto invece che da una seconda strada nel codice. */
export function xtermFont(): { fontFamily: string; fontSize: number } {
  const css = getComputedStyle(document.documentElement);
  const family = css.getPropertyValue('--font-mono').trim();
  const size = parseInt(css.getPropertyValue('--term-fs').trim(), 10);
  return {
    fontFamily: family || 'ui-monospace, monospace',
    fontSize: Number.isFinite(size) ? size : 14,
  };
}
