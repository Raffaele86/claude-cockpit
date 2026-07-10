import { useState } from 'react';
import { t, LOCALE } from '../strings';
import { useDragWin } from './useDragWin';
import type { CheckpointEntry } from '../protocol';

interface Props {
  checkpoints: CheckpointEntry[];
  busy: boolean;
  error: string | null;
  onCreate: (label: string) => void;
  onRestore: (file: string) => void;
  onClose: () => void;
}

function fmtSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

/** Snapshot dei file del progetto: crea tar.gz e ripristina. Il restore riporta i file allo
 *  stato dello snapshot ma NON elimina i file creati dopo (avviso nel pannello). */
export function Checkpoints({ checkpoints, busy, error, onCreate, onRestore, onClose }: Props) {
  const { ref, style, onBarMouseDown } = useDragWin();
  const [label, setLabel] = useState('');
  const [armed, setArmed] = useState<string | null>(null); // file in attesa di conferma restore

  return (
    <div className="float-win doctor" ref={ref} style={style}>
      <div className="float-bar" onMouseDown={onBarMouseDown}>
        <strong>{t('cpTitle')}</strong>
        <button className="mini ghost" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="doctor-body">
        <p className="doc-note">{t('cpNote')}</p>
        <div className="doc-actions">
          <input
            className="cp-label"
            placeholder={t('cpLabelPh')}
            value={label}
            maxLength={40}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button
            className="mini ghost"
            disabled={busy}
            onClick={() => {
              onCreate(label);
              setLabel('');
            }}
          >
            {busy ? '…' : t('cpCreate')}
          </button>
        </div>
        {error && <p className="doc-hint">{error}</p>}
        {!checkpoints.length && <p className="doc-note">{t('cpEmpty')}</p>}
        {checkpoints.map((c) => (
          <div key={c.file} className="doc-check">
            <span className="doc-dot ok">📸</span>
            <div className="doc-check-txt">
              <span className="doc-label">
                {new Date(c.ts).toLocaleString(LOCALE)} {c.label && <code>{c.label}</code>} · {fmtSize(c.size)}
              </span>
            </div>
            <button
              className={armed === c.file ? 'mini on' : 'mini ghost'}
              disabled={busy}
              onClick={() => {
                if (armed !== c.file) {
                  setArmed(c.file);
                  return;
                }
                setArmed(null);
                onRestore(c.file);
              }}
            >
              {armed === c.file ? t('cpConfirm') : t('cpRestore')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
