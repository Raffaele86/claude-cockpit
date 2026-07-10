// Barra schede: N conversazioni indipendenti sullo stesso progetto (chiave canale path##tab).
// Doppio click sul titolo = rinomina locale; 📌 sulla scheda attiva = pin in prima posizione.
import { useState } from 'react';
import { t as tr } from '../strings';

interface Props {
  tabs: string[]; // id: 'main', 't2', ... (già ordinati: pinnate davanti)
  active: string;
  busy: Record<string, boolean>; // per tab id
  titles?: Record<string, string>; // per tab id: titolo sessione o rinomina (fallback "Chat N")
  pins?: Record<string, boolean>; // per tab id
  onSelect: (tab: string) => void;
  onRename: (tab: string, name: string) => void;
  onTogglePin: (tab: string) => void;
  onAdd: () => void;
  onClose: (tab: string) => void;
}

export function Tabs({ tabs, active, busy, titles, pins, onSelect, onRename, onTogglePin, onAdd, onClose }: Props) {
  const [editing, setEditing] = useState<string | null>(null); // tab id in rinomina
  const [draft, setDraft] = useState('');

  function commit(tab: string) {
    setEditing(null);
    onRename(tab, draft);
  }

  return (
    <div className="tabs">
      {tabs.map((t, i) => (
        <div key={t} className={t === active ? 'tab on' : 'tab'} onClick={() => onSelect(t)}>
          {busy[t] && <span className="tab-busy" />}
          {pins?.[t] && editing !== t && <span className="tab-pinned">📌</span>}
          {editing === t ? (
            <input
              className="tab-rename"
              value={draft}
              autoFocus
              maxLength={40}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(t)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit(t);
                if (e.key === 'Escape') setEditing(null);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="tab-label"
              title={`${titles?.[t] ?? ''}\n${tr('tabRenameTitle')}`.trim()}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setDraft(titles?.[t] ?? '');
                setEditing(t);
              }}
            >
              {titles?.[t] ?? `${tr('chat')} ${i + 1}`}
            </span>
          )}
          {t === active && editing !== t && (
            <button
              className={pins?.[t] ? 'tab-x on' : 'tab-x'}
              title={tr('tabPinTitle')}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(t);
              }}
            >
              📌
            </button>
          )}
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
