import { useEffect, useRef } from 'react';
import { Icon, type IconName } from './icons';

export interface MenuItem {
  label: string;
  icon?: IconName;
  danger?: boolean;
  onClick: () => void;
}

export interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Clamp ai bordi finestra dopo il primo render.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth) el.style.left = `${Math.max(4, innerWidth - r.width - 8)}px`;
    if (r.bottom > innerHeight) el.style.top = `${Math.max(4, innerHeight - r.height - 8)}px`;
  }, [menu]);

  return (
    <>
      <div className="ctx-backdrop" onClick={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())} />
      <div ref={ref} className="ctx-menu" style={{ left: menu.x, top: menu.y }}>
        {menu.items.map((it, i) => (
          <button
            key={i}
            className={it.danger ? 'ctx-item danger' : 'ctx-item'}
            onClick={() => {
              onClose();
              it.onClick();
            }}
          >
            {it.icon && <Icon name={it.icon} size={13} />} {it.label}
          </button>
        ))}
      </div>
    </>
  );
}
