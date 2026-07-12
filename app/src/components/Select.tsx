import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons';
import { t } from '../strings';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  title?: string;
  className?: string;
  dropUp?: boolean; // popover verso l'alto (contesti in fondo alla finestra)
  searchable?: boolean; // casella di filtro in cima (liste lunghe, es. catalogo OpenRouter)
}

/** Select custom (sostituisce i <select> nativi): popover elevato, tastiera ↑↓⏎Esc,
 *  filtro opzionale per le liste lunghe. */
export function Select({ value, options, onChange, placeholder, title, className, dropUp, searchable }: Props) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [q, setQ] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const current = options.find((o) => o.value === value);

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!searchable || !query) return options;
    return options.filter((o) => `${o.label} ${o.value}`.toLowerCase().includes(query));
  }, [options, q, searchable]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Solo all'APERTURA: options è un array nuovo a ogni render — con options nei deps
  // questo effetto girava di continuo e ogni hover riportava lo scroll alla voce selezionata.
  useEffect(() => {
    if (open) {
      setQ('');
      const i = options.findIndex((o) => o.value === value);
      setIdx(i >= 0 ? i : 0);
      if (searchable) requestAnimationFrame(() => searchRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setIdx(0);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.children[idx]?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx((i) => (shown.length ? (i + 1) % shown.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => (shown.length ? (i - 1 + shown.length) % shown.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (shown[idx]) pick(shown[idx].value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className={`sel ${className ?? ''}`} ref={wrap} onKeyDown={onKey}>
      <button type="button" className="sel-btn" title={title} onClick={() => setOpen((o) => !o)}>
        <span className="sel-label">{current?.label ?? placeholder ?? '—'}</span>
        <Icon name="chevron-down" size={12} />
      </button>
      {open && (
        <div className={dropUp ? 'sel-pop up' : 'sel-pop'}>
          {searchable && (
            <input
              ref={searchRef}
              className="sel-search"
              placeholder={t('modelSearchPlaceholder')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          )}
          <div className="sel-list" ref={listRef}>
            {shown.map((o, i) => (
              <button
                type="button"
                key={o.value}
                className={`sel-item ${i === idx ? 'focus' : ''} ${o.value === value ? 'on' : ''}`}
                onMouseEnter={() => setIdx(i)}
                onClick={() => pick(o.value)}
              >
                <span className="sel-item-label">{o.label}</span>
                {o.hint && <span className="sel-item-hint">{o.hint}</span>}
                {o.value === value && <Icon name="check" size={12} />}
              </button>
            ))}
            {!shown.length && <div className="sel-empty">{t('modelNoMatch')}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
