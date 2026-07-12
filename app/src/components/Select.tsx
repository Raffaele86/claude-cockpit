import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

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
}

/** Select custom (sostituisce i <select> nativi): popover elevato, tastiera ↑↓⏎Esc. */
export function Select({ value, options, onChange, placeholder, title, className, dropUp }: Props) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      const i = options.findIndex((o) => o.value === value);
      setIdx(i >= 0 ? i : 0);
    }
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.children[idx]?.scrollIntoView({ block: 'nearest' });
  }, [open, idx]);

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
      setIdx((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (options[idx]) pick(options[idx].value);
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
        <div className={dropUp ? 'sel-pop up' : 'sel-pop'} ref={listRef}>
          {options.map((o, i) => (
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
        </div>
      )}
    </div>
  );
}
