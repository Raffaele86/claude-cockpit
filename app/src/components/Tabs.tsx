// Barra schede: N conversazioni indipendenti sullo stesso progetto (chiave canale path##tab).
// Doppio click sul titolo = rinomina locale; 📌 sulla scheda attiva = pin in prima posizione.
import { useRef, useState } from 'react';
import { t as tr } from '../strings';
import { Icon } from './icons';

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
  const listRef = useRef<HTMLDivElement>(null);

  function commit(tab: string) {
    setEditing(null);
    onRename(tab, draft);
  }

  // Il pattern tab impone le frecce: senza, tabIndex -1 sulle schede non attive
  // le renderebbe irraggiungibili. Attivazione MANUALE (Invio/Spazio, che il
  // <button> gestisce da solo): spostare il fuoco non deve cambiare sessione.
  // In rinomina una scheda non ha [role=tab], gli indici slitterebbero: si esce.
  function onTabKeys(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    if (editing !== null) return;
    const last = tabs.length - 1;
    let next: number;
    if (e.key === 'ArrowRight') next = i === last ? 0 : i + 1;
    else if (e.key === 'ArrowLeft') next = i === 0 ? last : i - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else return;
    e.preventDefault();
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <div className="tabs" role="tablist" ref={listRef}>
      {tabs.map((t, i) => (
        <div key={t} role="presentation" className={t === active ? 'tab-wrap on' : 'tab-wrap'}>
          {editing === t ? (
            <span className="tab">
              {busy[t] && <span className="tab-busy" />}
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
              />
            </span>
          ) : (
            <button
              type="button"
              role="tab"
              aria-selected={t === active}
              tabIndex={t === active ? 0 : -1}
              className={t === active ? 'tab on' : 'tab'}
              onClick={() => onSelect(t)}
              onKeyDown={(e) => onTabKeys(e, i)}
            >
              {busy[t] && <span className="tab-busy" />}
              {pins?.[t] && <span className="tab-pinned"><Icon name="pin" size={11} /></span>}
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
            </button>
          )}
          {t === active && editing !== t && (
            <button
              type="button"
              className={pins?.[t] ? 'tab-x on' : 'tab-x'}
              title={tr('tabPinTitle')} aria-label={tr('tabPinTitle')}
              onClick={() => onTogglePin(t)}
            >
              <Icon name="pin" size={12} />
            </button>
          )}
          {tabs.length > 1 && (
            <button type="button" className="tab-x" title={tr('closeTabTitle')} aria-label={tr('closeTabTitle')} onClick={() => onClose(t)}>
              <Icon name="close" />
            </button>
          )}
        </div>
      ))}
      <button type="button" className="tab-add" title={tr('newTabTitle')} aria-label={tr('newTabTitle')} onClick={onAdd}>
        +
      </button>
    </div>
  );
}
