import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Finestra flottante trascinabile dalla barra del titolo (mouse, penna o dito).
 * pos=null = centrata via CSS; il drag passa a coordinate fisse, clampate al viewport.
 */
export function useDragWin() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const onBarPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Sotto i 768px le finestre sono a tutto schermo: non c'e' niente da spostare
    // e il drag litigherebbe con lo scorrimento del contenuto.
    if (window.matchMedia('(max-width: 767px)').matches) return;
    // I controlli nella barra restano cliccabili, il drag parte solo dallo sfondo.
    if ((e.target as HTMLElement).closest('button, input, select, textarea')) return;
    const el = ref.current;
    if (!el) return;
    e.preventDefault();
    const bar = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    const onMove = (ev: PointerEvent) => {
      // Clamp: almeno un pezzo di barra resta sempre raggiungibile.
      const x = Math.min(window.innerWidth - 60, Math.max(60 - rect.width, ev.clientX - dx));
      const y = Math.min(window.innerHeight - 40, Math.max(0, ev.clientY - dy));
      setPos({ x, y });
    };
    // Un solo terminatore: lostpointercapture arriva DOPO pointerup e
    // pointercancel, ma anche quando il capture cade da solo (barra nascosta o
    // rimossa a meta' gesto). Ascoltare solo up/cancel lasciava il listener di
    // move attaccato in quel caso.
    const onEnd = () => {
      bar.removeEventListener('pointermove', onMove);
      bar.removeEventListener('lostpointercapture', onEnd);
    };
    // Il capture ridirige i move sulla barra anche fuori dai suoi bordi:
    // niente listener su window da rimuovere a mano.
    bar.setPointerCapture(e.pointerId);
    bar.addEventListener('pointermove', onMove);
    bar.addEventListener('lostpointercapture', onEnd);
  }, []);

  useEffect(() => {
    // Scendendo sotto i 768px la finestra torna a tutto schermo, ma un left/top
    // gia' scritto inline batte il CSS della media query: senza questo reset,
    // una finestra trascinata da desktop resta fuori posto sul telefono.
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => {
      if (mq.matches) setPos(null);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return { ref, style: pos ? { left: pos.x, top: pos.y, transform: 'none' } : undefined, onBarPointerDown };
}
