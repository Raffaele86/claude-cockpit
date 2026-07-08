import { useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogModel } from '../protocol';
import { t } from '../strings';

interface Props {
  models: CatalogModel[];
  current: string;
  loading?: boolean;
  onChange: (id: string) => void;
}

/** Selettore modelli con casella di ricerca: pensato per cataloghi grandi (OpenRouter, 300+ modelli).
 *  Filtra mentre scrivi; i modelli free sono marcati. Chiude su Esc / click fuori. */
export function ModelCombo({ models, current, loading, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? models.filter((m) => m.id.toLowerCase().includes(needle) || m.label.toLowerCase().includes(needle)) : models;
    return list.slice(0, 200); // cap render: la ricerca restringe, la lista resta scattante
  }, [models, q]);

  const label = current ? current.split(',').slice(-1)[0].split('/').slice(-1)[0] : loading ? t('modelLoading') : 'model…';

  return (
    <div className="model-combo" ref={ref}>
      <button className="effort-select model-combo-btn" title={t('modelComboTitle')} onClick={() => setOpen((o) => !o)}>
        {label} ▾
      </button>
      {open && (
        <div className="model-combo-pop">
          <input
            autoFocus
            className="model-combo-search"
            placeholder={t('modelSearchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          />
          <div className="model-combo-list">
            {loading && models.length === 0 ? (
              <div className="model-combo-empty">{t('modelLoading')}</div>
            ) : filtered.length === 0 ? (
              <div className="model-combo-empty">{t('modelNoMatch')}</div>
            ) : (
              filtered.map((m) => (
                <button
                  key={m.id}
                  className={m.id === current ? 'model-combo-item on' : 'model-combo-item'}
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                    setQ('');
                  }}
                  title={m.id}
                >
                  {m.free && <span className="model-free">free</span>}
                  <span className="model-combo-label">{m.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
