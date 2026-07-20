import type { ReactNode } from 'react';
import { Icon, type IconName } from '../components/icons';
import { t } from '../strings';

/**
 * Layout telefono — un ALBERO diverso, non il desktop riflusso.
 *
 * Cosa c'era prima: la topbar andava a capo su due righe, sotto una striscia
 * orizzontale coi progetti, sotto ancora la riga delle schede. Tre barre in alto
 * su uno schermo alto 780, niente in basso dove arriva il pollice, il navigatore
 * file nascosto con display:none e il modello+sforzo pure.
 *
 * Cosa c'e' adesso: UNA barra in alto, il contenuto a tutto schermo, i tasti
 * accessori del terminale appena sopra la tastiera, e una barra in basso nella
 * zona del pollice. Progetti, schede, file e attivita' diventano fogli che si
 * aprono dal basso invece di rubare spazio in permanenza.
 */

export interface BottomTab {
  key: string;
  icon: IconName;
  label: string;
  active: boolean;
  onSelect: () => void;
  /** Pallino di stato sull'icona (es. sessioni occupate). */
  badge?: number;
}

interface Props {
  topbar: ReactNode;
  banner?: ReactNode;
  overlays?: ReactNode;
  main: ReactNode;
  /** Tasti accessori del terminale: solo in vista CLI. */
  accessory?: ReactNode;
  tabs: BottomTab[];
  /** Foglio dal basso: progetti, schede, file, attivita'. */
  sheet?: { title: string; content: ReactNode; onClose: () => void } | null;
}

export function MobileLayout({ topbar, banner, overlays, main, accessory, tabs, sheet }: Props) {
  return (
    <div className="app app-mobile">
      {topbar}
      {banner}
      {overlays}

      <div className="mobile-main">{main}</div>

      {accessory}

      <nav className="bottombar" aria-label="Navigazione principale">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={t.active ? 'bottombar-item on' : 'bottombar-item'}
            aria-current={t.active ? 'page' : undefined}
            onClick={t.onSelect}
          >
            <span className="bottombar-icon">
              <Icon name={t.icon} size={20} />
              {t.badge ? <span className="bottombar-badge">{t.badge}</span> : null}
            </span>
            <span className="bottombar-label">{t.label}</span>
          </button>
        ))}
      </nav>

      {sheet && (
        <>
          <div className="sheet-backdrop" onClick={sheet.onClose} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label={sheet.title}>
            <div className="sheet-bar">
              {/* La maniglia e' decorativa: il foglio si chiude col velo o col
                  bottone. Un trascinamento vero litigherebbe con lo scorrimento
                  del contenuto, ed e' il tipo di gesto che fallisce in silenzio. */}
              <span className="sheet-grip" aria-hidden="true" />
              <span className="sheet-title">{sheet.title}</span>
              <button className="sheet-close btn-icon" aria-label={t('sheetClose')} onClick={sheet.onClose}>
                <Icon name="close" />
              </button>
            </div>
            <div className="sheet-body">{sheet.content}</div>
          </div>
        </>
      )}
    </div>
  );
}
