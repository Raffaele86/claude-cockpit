import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../strings';
import { Icon } from './icons';
import { Select } from './Select';

export interface SessionCtl {
  cli: boolean;
  curProv: string;
  curModel: string;
  curEffort: string;
  curMode: string;
  modelList: { id: string; label: string }[];
  modes: { key: string; label: string }[];
  setProv: (p: string) => void;
  setModel: (m: string) => void;
  setEff: (ef: string) => void;
  setPerm: (mode: string) => void;
}

interface Props {
  ctl: SessionCtl;
  providers: string[];
  onOpen?: () => void; // es. refresh catalogo modelli
  children: ReactNode; // trigger: il pill della topbar
}

/** Popover Sessione ancorato al pill: provider/modello/effort/permessi a un click.
 *  Resta SEMPRE aperto mentre si regolano i valori; si chiude solo con click fuori, Esc o ✕. */
export function SessionMenu({ ctl, providers, onOpen, children }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
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
    <div className="smenu" ref={wrap}>
      <div
        onClick={() => {
          if (!open) onOpen?.();
          setOpen(!open);
        }}
      >
        {children}
      </div>
      {open && (
        <div className="smenu-pop">
          <div className="smenu-head">
            <span className="smenu-title">{t('smTitle')}</span>
            <button className="mini ghost btn-icon" onClick={() => setOpen(false)}>
              <Icon name="close" size={13} />
            </button>
          </div>
          <div className="smenu-row">
            <span className="smenu-label">{t('smProvider')}</span>
            <div className="provider-toggle">
              {providers.map((p) => (
                <button key={p} className={ctl.curProv === p ? 'prov on' : 'prov'} onClick={() => ctl.setProv(p)}>
                  {p === 'claude' ? 'Claude' : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="smenu-row">
            <span className="smenu-label">{t('smModel')}</span>
            <Select
              value={ctl.curModel}
              placeholder="model…"
              searchable={ctl.modelList.length > 10}
              options={ctl.modelList.map((m) => ({ value: m.id, label: m.label }))}
              onChange={ctl.setModel}
            />
          </div>
          <div className="smenu-row">
            <span className="smenu-label">{t('smEffort')}</span>
            <Select
              value={ctl.curEffort}
              placeholder="effort…"
              options={['low', 'medium', 'high', 'xhigh'].map((ef) => ({ value: ef, label: ef }))}
              onChange={ctl.setEff}
            />
          </div>
          <div className="smenu-row">
            <span className="smenu-label">{t('smMode')}</span>
            <div className="provider-toggle">
              {ctl.modes.map((m) => (
                <button key={m.key} className={ctl.curMode === m.key ? 'prov on' : 'prov'} onClick={() => ctl.setPerm(m.key)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
