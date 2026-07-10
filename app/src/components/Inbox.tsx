import { t } from '../strings';
import { useDragWin } from './useDragWin';

export interface InboxEntry {
  key: string; // chiave canale (path o path##tab)
  name: string;
  busy: boolean;
  snippet: string; // ultimo testo assistant, troncato
  costUsd: number;
}

/** Inbox: tutte le sessioni chat aperte (ogni progetto/scheda) con stato e ultimo messaggio.
 *  Le schede in vista CLI non hanno stato qui (i prompt non passano dall'engine). */
export function Inbox({ entries, onOpen, onClose }: { entries: InboxEntry[]; onOpen: (key: string) => void; onClose: () => void }) {
  const { ref, style, onBarMouseDown } = useDragWin();
  return (
    <div className="float-win doctor" ref={ref} style={style}>
      <div className="float-bar" onMouseDown={onBarMouseDown}>
        <strong>{t('inboxTitle')}</strong>
        <button className="mini ghost" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="doctor-body">
        {!entries.length && <p className="doc-note">{t('inboxEmpty')}</p>}
        {entries.map((e) => (
          <button key={e.key} className="inbox-row" onClick={() => onOpen(e.key)}>
            <span>{e.busy ? '⏳' : '✓'}</span>
            <span className="inbox-name">{e.name}</span>
            <span className="inbox-snippet">{e.snippet}</span>
            {e.costUsd > 0 && <span className="inbox-cost">${e.costUsd.toFixed(2)}</span>}
          </button>
        ))}
        <p className="doc-note">{t('inboxNote')}</p>
      </div>
    </div>
  );
}
