import { useCallback, useEffect, useState } from 'react';
import { t } from '../strings';
import { useDragWin } from './useDragWin';

const IS_ELECTRON = navigator.userAgent.includes('Electron');

interface Check {
  id: string;
  ok: boolean;
  detail: string;
}

interface Props {
  connected: boolean;
  onStartEngine: () => void;
  onClose: () => void;
}

/** Verifica prerequisiti (doctor): WSL/Node/Claude CLI/engine/porta, con istruzioni per i punti rossi.
 *  Nel browser i check di sistema non sono eseguibili: mostra i requisiti come checklist informativa. */
export function Doctor({ connected, onStartEngine, onClose }: Props) {
  const [report, setReport] = useState<{ platform: string; checks: Check[] } | null>(null);
  const [running, setRunning] = useState(false);
  const { ref, style, onBarMouseDown } = useDragWin();

  const run = useCallback(() => {
    if (!IS_ELECTRON) return;
    setRunning(true);
    void window.cockpit
      .doctor()
      .then(setReport)
      .finally(() => setRunning(false));
  }, []);

  useEffect(run, [run]);

  const hint = (c: Check, platform: string): string => {
    if (c.ok) return '';
    switch (c.id) {
      case 'wsl':
        return t('docHintWsl');
      case 'wsluser':
        return t('docHintWslUser');
      case 'node':
        return platform === 'win32' ? t('docHintNodeWsl') : t('docHintNode');
      case 'claude':
        return t('docHintClaude');
      case 'engine':
        return platform === 'darwin' ? t('docHintEngineMac') : t('docHintEngine');
      case 'port':
        return t('docHintPort');
      default:
        return '';
    }
  };

  return (
    <div className="float-win doctor" ref={ref} style={style}>
      <div className="float-bar" onMouseDown={onBarMouseDown}>
        <strong>{t('docTitle')}</strong>
        <span className={connected ? 'doc-conn ok' : 'doc-conn'}>{connected ? t('docConnected') : t('docDisconnected')}</span>
        <button className="mini ghost" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="doctor-body">
        {!IS_ELECTRON ? (
          <>
            <p className="doc-note">{t('docBrowserNote')}</p>
            <ul className="doc-reqs">
              <li>{t('docReqEngine')}</li>
              <li>{t('docReqClaude')}</li>
              <li>{t('docReqNode')}</li>
            </ul>
          </>
        ) : !report ? (
          <p className="doc-note">{t('docRunning')}</p>
        ) : (
          <>
            {report.checks.map((c) => (
              <div key={c.id} className="doc-check">
                <span className={c.ok ? 'doc-dot ok' : 'doc-dot bad'}>{c.ok ? '✓' : '✗'}</span>
                <div className="doc-check-txt">
                  <span className="doc-label">
                    {t('docLabel')(c.id)} <code>{c.detail}</code>
                  </span>
                  {!c.ok && <span className="doc-hint">{hint(c, report.platform)}</span>}
                </div>
              </div>
            ))}
            <div className="doc-actions">
              <button className="mini ghost" disabled={running} onClick={run}>
                {running ? '…' : t('docRerun')}
              </button>
              {report.checks.some((c) => (c.id === 'engine' || c.id === 'port') && !c.ok) && (
                <button className="mini ghost" onClick={onStartEngine}>
                  {t('docStartEngine')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
