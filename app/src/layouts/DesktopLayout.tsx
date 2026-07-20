import type { ReactNode } from 'react';

/**
 * Layout desktop: l'impianto storico a tre colonne.
 *
 * App.tsx resta il proprietario di TUTTO lo stato e di tutti gli handler: qui
 * arrivano solo pezzi gia' costruiti. E' una scelta deliberata — il componente
 * da 1587 righe contiene la logica WebSocket e di sessione appena sistemata da
 * due audit, e decomporlo per ragioni grafiche sarebbe il modo piu' rapido di
 * rompere quello che funziona. Si estrae il minimo indispensabile perche' i due
 * layout siano due ALBERI diversi e non lo stesso albero con delle toppe.
 */
export interface LayoutSlots {
  /** Barra superiore gia' composta. */
  topbar: ReactNode;
  /** Striscia di errore engine, se presente. */
  banner?: ReactNode;
  /** Palette, finestre flottanti, prompt permessi: vivono fuori dal flusso. */
  overlays?: ReactNode;
  /** Colonna progetti (con dentro il navigatore file). */
  rail: ReactNode;
  /** Contenuto: schede, vista, composer. */
  main: ReactNode;
  /** Pannello laterale (attivita' + MCP). */
  side: ReactNode;
  sideOpen: boolean;
  onCloseSide: () => void;
}

interface Props extends LayoutSlots {
  /** Maniglia di ridimensionamento della colonna: solo qui, sul telefono non esiste. */
  onRailResize: (e: React.PointerEvent<HTMLDivElement>) => void;
  resizerTitle: string;
}

export function DesktopLayout({
  topbar,
  banner,
  overlays,
  rail,
  main,
  side,
  sideOpen,
  onCloseSide,
  onRailResize,
  resizerTitle,
}: Props) {
  return (
    <div className="app">
      {topbar}
      {banner}
      {overlays}
      <div className="body">
        {rail}
        <div className="rail-resizer" title={resizerTitle} onPointerDown={onRailResize} />
        <div className="main">{main}</div>
        {sideOpen && <div className="side-backdrop mobile-only" onClick={onCloseSide} />}
        <aside className={sideOpen ? 'side open' : 'side'}>{side}</aside>
      </div>
    </div>
  );
}
