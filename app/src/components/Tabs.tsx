// Barra schede: N conversazioni indipendenti sullo stesso progetto (chiave canale path##tab).
import { t as tr } from '../strings';

interface Props {
  tabs: string[]; // id: 'main', 't2', ...
  active: string;
  busy: Record<string, boolean>; // per tab id
  titles?: Record<string, string>; // per tab id: titolo sessione (fallback "Chat N")
  onSelect: (tab: string) => void;
  onAdd: () => void;
  onClose: (tab: string) => void;
}

export function Tabs({ tabs, active, busy, titles, onSelect, onAdd, onClose }: Props) {
  return (
    <div className="tabs">
      {tabs.map((t, i) => (
        <div key={t} className={t === active ? 'tab on' : 'tab'} onClick={() => onSelect(t)}>
          {busy[t] && <span className="tab-busy" />}
          <span className="tab-label" title={titles?.[t]}>{titles?.[t] ?? `${tr('chat')} ${i + 1}`}</span>
          {tabs.length > 1 && (
            <button
              className="tab-x"
              title={tr('closeTabTitle')}
              onClick={(e) => {
                e.stopPropagation();
                onClose(t);
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button className="tab-add" title={tr('newTabTitle')} onClick={onAdd}>
        +
      </button>
    </div>
  );
}
