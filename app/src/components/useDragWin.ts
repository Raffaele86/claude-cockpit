import { useCallback, useRef, useState } from 'react';

/**
 * Finestra flottante trascinabile dalla barra del titolo (mouse, desktop).
 * pos=null = centrata via CSS; il drag passa a coordinate fisse, clampate al viewport.
 */
export function useDragWin() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const onBarMouseDown = useCallback((e: React.MouseEvent) => {
    // I controlli nella barra restano cliccabili, il drag parte solo dallo sfondo.
    if ((e.target as HTMLElement).closest('button, input, select, textarea')) return;
    const el = ref.current;
    if (!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    const onMove = (ev: MouseEvent) => {
      // Clamp: almeno un pezzo di barra resta sempre raggiungibile.
      const x = Math.min(window.innerWidth - 60, Math.max(60 - rect.width, ev.clientX - dx));
      const y = Math.min(window.innerHeight - 40, Math.max(0, ev.clientY - dy));
      setPos({ x, y });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  return { ref, style: pos ? { left: pos.x, top: pos.y, transform: 'none' } : undefined, onBarMouseDown };
}
