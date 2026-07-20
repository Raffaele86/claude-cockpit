import { useEffect, type RefObject } from 'react';

/**
 * Le due meccaniche del fuoco condivise da FloatPanel, PermissionPrompt e
 * CommandPalette. Ogni dialogo tiene il proprio Escape, che vuol dire cose
 * diverse (chiudi, nega, torna indietro di un livello).
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Ridà il fuoco a `previous`, ma solo se il dialogo se l'è portato via chiudendosi.
 *  Quando il nodo che ha il fuoco viene rimosso, `activeElement` torna a <body>:
 *  è il segnale che il fuoco è morto col dialogo e va restituito. Se invece è su
 *  un altro elemento vivo, l'utente (o il comando appena eseguito) l'ha spostato
 *  di proposito — queste finestre non bloccano la pagina sotto — e riportarlo
 *  indietro lo strapperebbe da dove sta scrivendo. */
export function restoreFocus(previous: Element | null) {
  const active = document.activeElement;
  if (active && active !== document.body) return;
  if (previous instanceof HTMLElement && previous !== document.body && previous.isConnected) previous.focus();
}

/** Porta il fuoco dentro `el` all'apertura e lo riporta dov'era alla chiusura:
 *  senza, chi naviga da tastiera riparte dall'inizio della pagina ogni volta. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    return () => restoreFocus(previous);
  }, [ref]);
}

/** Tab cicla dentro il dialogo invece di finire dietro, nella pagina.
 *  Da chiamare nell'onKeyDown del contenitore. */
export function trapTab(e: React.KeyboardEvent, container: HTMLElement | null) {
  if (e.key !== 'Tab' || !container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === container)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}
