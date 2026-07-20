import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from './icons';
import { t } from '../strings';
import { restoreFocus, trapTab } from './useDialogA11y';

export interface CommandChild {
  id: string;
  label: string;
  icon?: IconName;
  on?: boolean; // stato attuale (check a destra)
  run: () => void;
}

export interface Command {
  id: string;
  label: string;
  section: string; // etichetta di gruppo, già tradotta
  icon: IconName;
  shortcut?: string; // solo hint visivo
  keywords?: string; // alias per il filtro
  on?: boolean; // per i toggle: stato attuale
  run?: () => void; // comando diretto → esegue e chiude
  children?: () => CommandChild[]; // sotto-menu (progetto, modello, …)
}

interface Props {
  open: boolean;
  commands: Command[];
  onClose: () => void;
}

/** Fuzzy semplice: prefisso > contiene > sottosequenza. 0 = nessun match. */
function score(hay: string, q: string): number {
  if (!q) return 1;
  if (hay.startsWith(q)) return 3;
  if (hay.includes(q)) return 2;
  let i = 0;
  for (const c of hay) {
    if (c === q[i]) i++;
    if (i === q.length) return 1;
  }
  return 0;
}

type Row =
  | { kind: 'header'; label: string }
  | { kind: 'item'; label: string; icon?: IconName; shortcut?: string; on?: boolean; hasChildren: boolean; exec: () => void };

/** Command palette stile Raycast: Ctrl/⌘+K, fuzzy, sotto-menu, tastiera. */
export function CommandPalette({ open, commands, onClose }: Props) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const [page, setPage] = useState<{ title: string; items: CommandChild[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Il pannello resta montato a vuoto: il fuoco va salvato all'apertura e
    // restituito alla chiusura qui, non allo smontaggio che non avviene mai.
    const previous = document.activeElement;
    setQ('');
    setPage(null);
    setIdx(0);
    // focus dopo il mount del pannello
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      // Annullato: se la palette si apre e chiude nello stesso fotogramma il
      // frame pendente arriverebbe dopo la restituzione del fuoco.
      cancelAnimationFrame(raf);
      restoreFocus(previous);
    };
  }, [open]);

  const rows: Row[] = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (page) {
      return page.items
        .map((c) => ({ c, s: score(c.label.toLowerCase(), query) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 50)
        .map(({ c }) => ({ kind: 'item' as const, label: c.label, icon: c.icon, on: c.on, hasChildren: false, exec: () => { c.run(); onClose(); } }));
    }
    const scored = commands
      .map((c) => ({ c, s: score(`${c.label} ${c.keywords ?? ''}`.toLowerCase(), query) }))
      .filter((x) => x.s > 0);
    if (query) scored.sort((a, b) => b.s - a.s);
    const out: Row[] = [];
    let lastSection = '';
    for (const { c } of scored.slice(0, 50)) {
      if (!query && c.section !== lastSection) {
        out.push({ kind: 'header', label: c.section });
        lastSection = c.section;
      }
      out.push({
        kind: 'item',
        label: c.label,
        icon: c.icon,
        shortcut: c.shortcut,
        on: c.on,
        hasChildren: !!c.children,
        exec: () => {
          if (c.children) {
            setPage({ title: c.label, items: c.children() });
            setQ('');
            setIdx(0);
          } else if (c.run) {
            c.run();
            onClose();
          }
        },
      });
    }
    return out;
  }, [q, page, commands, onClose]);

  const itemIdx = rows.map((r, i) => (r.kind === 'item' ? i : -1)).filter((i) => i >= 0);
  // Il fuoco resta nel campo di ricerca: la voce evidenziata la annuncia
  // aria-activedescendant, che punta all'id della riga.
  const activeId = itemIdx[idx] === undefined ? undefined : `cpal-opt-${itemIdx[idx]}`;

  useEffect(() => {
    setIdx(0);
  }, [q]);

  useEffect(() => {
    const el = listRef.current?.children[itemIdx[idx] ?? 0] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
    // itemIdx è ricreato a ogni render: con lui nei deps l'effetto girerebbe di continuo
    // e combatterebbe lo scroll manuale della lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  if (!open) return null;

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx((i) => (itemIdx.length ? (i + 1) % itemIdx.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => (itemIdx.length ? (i - 1 + itemIdx.length) % itemIdx.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[itemIdx[idx]];
      if (row && row.kind === 'item') row.exec();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (page) {
        setPage(null);
        setQ('');
        setIdx(0);
      } else onClose();
    } else if (e.key === 'Backspace' && !q && page) {
      e.preventDefault();
      setPage(null);
      setIdx(0);
    } else {
      trapTab(e, panelRef.current);
    }
  }

  return (
    <div className="cpal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="cpal-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('cpOpenTitle')}
        onKeyDown={onKey}
      >
        <div className="cpal-input-row">
          {page && (
            <span className="cpal-crumb">
              <Icon name="chevron-right" size={12} /> {page.title}
            </span>
          )}
          <input
            ref={inputRef}
            className="cpal-input"
            placeholder={page ? t('cpFilterPh') : t('cpPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            role="combobox"
            aria-label={page ? t('cpFilterPh') : t('cpPlaceholder')}
            aria-expanded={rows.length > 0}
            aria-controls="cpal-list"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
          />
        </div>
        <div className="cpal-list" ref={listRef} id="cpal-list" role="listbox" aria-label={page ? page.title : t('cpOpenTitle')}>
          {rows.map((r, i) =>
            r.kind === 'header' ? (
              // Dentro una listbox valgono solo le option: l'intestazione di gruppo
              // resta un separatore visivo e non viene annunciata.
              <div key={`h-${r.label}`} className="cpal-section" role="presentation">{r.label}</div>
            ) : (
              <button
                key={`i-${i}-${r.label}`}
                id={`cpal-opt-${i}`}
                role="option"
                aria-selected={itemIdx[idx] === i}
                tabIndex={-1}
                className={`cpal-item ${itemIdx[idx] === i ? 'focus' : ''}`}
                onMouseEnter={() => setIdx(itemIdx.indexOf(i))}
                onClick={() => r.exec()}
              >
                {r.icon && <Icon name={r.icon} size={14} />}
                <span className="cpal-label">{r.label}</span>
                {r.on && <Icon name="check" size={13} className="cpal-on" />}
                {r.shortcut && <kbd>{r.shortcut}</kbd>}
                {r.hasChildren && <Icon name="chevron-right" size={12} className="cpal-more" />}
              </button>
            ),
          )}
          {!rows.length && <div className="cpal-empty">{t('cpNoResults')}</div>}
        </div>
        <div className="cpal-footer">
          <span><kbd>↑↓</kbd> {t('cpHintNav')}</span>
          <span><kbd>⏎</kbd> {t('cpHintRun')}</span>
          <span><kbd>esc</kbd> {t('cpHintClose')}</span>
        </div>
      </div>
    </div>
  );
}
