import { t } from '../strings';
import { useDragWin } from './useDragWin';

export interface InboxEntry {
  key: string; // chiave canale (path o path##tab)
  name: string;
  title?: string; // titolo sessione (summary), se noto
  busy: boolean;
  hasPermission: boolean; // la sessione aspetta una decisione permesso
  snippet: string; // ultimo testo assistant, troncato
  costUsd: number;
}

interface Props {
  entries: InboxEntry[];
  onOpen: (key: string) => void;
  onStop: (key: string) => void;
  onClose: () => void;
}

/** Inbox operativa: tutte le sessioni aperte con stato, permessi in attesa e stop per riga. */
export function Inbox({ entries, onOpen, onStop, onClose }: Props) {
  const { ref, style, onBarMouseDown } = useDragWin();
  return (
    <div className="float-win doctor inbox-win" ref={ref} style={style}>
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
            <span title={e.hasPermission ? t('inboxPerm') : undefined}>{e.hasPermission ? '🔐' : e.busy ? '⏳' : '✓'}</span>
            <span className="inbox-name">{e.name}</span>
            {e.title && <span className="inbox-title">{e.title}</span>}
            <span className="inbox-snippet">{e.snippet}</span>
            {e.costUsd > 0 && <span className="inbox-cost">${e.costUsd.toFixed(2)}</span>}
            {e.busy && (
              <span
                className="mini ghost"
                role="button"
                title={t('inboxStop')}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onStop(e.key);
                }}
              >
                ⏹
              </span>
            )}
          </button>
        ))}
        <p className="doc-note">{t('inboxNote')}</p>
      </div>
    </div>
  );
}
