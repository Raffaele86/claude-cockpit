import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './icons';

export interface MenuItem {
  id: string;
  label: string;
  icon: IconName;
  on?: boolean; // toggle attivo (check a destra)
  run: () => void;
}

/** Menu ⋯ della topbar: popover ancorato a destra, chiusura mousedown-fuori/Esc. */
export function OverflowMenu({ items, title }: { items: MenuItem[]; title?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="omenu" ref={wrap}>
      <button className={open ? 'mini on btn-icon' : 'mini ghost btn-icon'} title={title} onClick={() => setOpen((o) => !o)}>
        <Icon name="menu" />
      </button>
      {open && (
        <div className="omenu-pop">
          {items.map((it) => (
            <button
              key={it.id}
              className="omenu-item"
              onClick={() => {
                it.run();
                setOpen(false);
              }}
            >
              <Icon name={it.icon} size={14} />
              <span className="omenu-label">{it.label}</span>
              {it.on && <Icon name="check" size={13} className="omenu-on" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
