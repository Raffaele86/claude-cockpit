import { useSyncExternalStore } from 'react';

/**
 * DUE ASSI ORTOGONALI, mai uno solo.
 *
 * - `mode` (larghezza) decide QUALE LAYOUT: telefono / intermedio / desktop.
 * - `coarse` (tipo di puntatore) decide QUANTO SONO GRANDI I BERSAGLI,
 *   a prescindere dalla larghezza.
 *
 * Tenerli separati e' cio' che impedisce strutturalmente di ricadere in "un
 * layout con toppe": un portatile Windows touch a 1400px ha le stesse dita di un
 * telefono e oggi si becca bersagli da 17px, perche' l'unico criterio esistente
 * e' `max-width: 840px`.
 *
 * 767 e non 840: 840 farebbe cadere l'iPad in verticale (834px) nel layout
 * telefono. I valori sono gli stessi di --bp-md/--bp-lg in tokens.css; sono
 * ripetuti qui perche' matchMedia non legge le custom property.
 */

export type LayoutMode = 'phone' | 'mid' | 'desktop';

const QUERIES = {
  phone: '(max-width: 767px)',
  mid: '(min-width: 768px) and (max-width: 1099px)',
  coarse: '(pointer: coarse)',
} as const;

const mqls: Partial<Record<keyof typeof QUERIES, MediaQueryList>> = {};
const mql = (k: keyof typeof QUERIES) => (mqls[k] ??= window.matchMedia(QUERIES[k]));

/** Un solo abbonamento per tutte e tre le query: useSyncExternalStore richiede
 *  che `subscribe` sia stabile, altrimenti si ri-abbona a ogni render. */
function subscribe(onChange: () => void): () => void {
  const list = (Object.keys(QUERIES) as (keyof typeof QUERIES)[]).map(mql);
  for (const m of list) m.addEventListener('change', onChange);
  return () => {
    for (const m of list) m.removeEventListener('change', onChange);
  };
}

/** Snapshot memoizzato: useSyncExternalStore confronta con Object.is, quindi
 *  restituire un oggetto nuovo a ogni chiamata manderebbe React in ciclo. */
let cached = { mode: 'desktop' as LayoutMode, coarse: false };

function snapshot(): { mode: LayoutMode; coarse: boolean } {
  const mode: LayoutMode = mql('phone').matches ? 'phone' : mql('mid').matches ? 'mid' : 'desktop';
  const coarse = mql('coarse').matches;
  if (mode !== cached.mode || coarse !== cached.coarse) cached = { mode, coarse };
  return cached;
}

/** In SSR/test senza window il valore serve comunque stabile. */
const serverSnapshot = () => cached;

export function useLayoutMode(): { mode: LayoutMode; coarse: boolean } {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
