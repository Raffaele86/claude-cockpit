import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../strings';

/**
 * Sostituisce window.confirm (SystemPanel, TodosPanel) e window.alert (Settings).
 *
 * Non e' solo una questione estetica: il confirm nativo non si puo' etichettare
 * ("OK" per uccidere un processo non dice cosa succede), non distingue
 * un'azione distruttiva da una innocua, e su Android compare in cima allo
 * schermo — cioe' il piu' lontano possibile dal pollice, su un bottone che
 * conferma qualcosa di irreversibile.
 */

export interface ConfirmRequest {
  message: string;
  /** Etichetta dell'azione: "Uccidi il processo", non "OK". */
  confirmLabel?: string;
  /** Rosso e non corallo: l'accento e' riservato all'azione primaria. */
  danger?: boolean;
  /** Solo informativo: un bottone solo, niente da annullare (ex window.alert). */
  alert?: boolean;
}

export function useConfirm() {
  const [req, setReq] = useState<(ConfirmRequest & { resolve: (ok: boolean) => void }) | null>(null);

  const confirm = useCallback(
    (r: ConfirmRequest | string) =>
      new Promise<boolean>((resolve) => {
        setReq({ ...(typeof r === 'string' ? { message: r } : r), resolve });
      }),
    [],
  );

  const dialog = req ? (
    <ConfirmDialog
      req={req}
      onClose={(ok) => {
        req.resolve(ok);
        setReq(null);
      }}
    />
  ) : null;

  return { confirm, dialog };
}

function ConfirmDialog({ req, onClose }: { req: ConfirmRequest; onClose: (ok: boolean) => void }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Il fuoco entra nel dialogo: senza, la tabulazione resta dietro al velo e
    // un lettore di schermo continua a leggere la pagina sotto.
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="confirm-overlay" onClick={() => onClose(false)}>
      <div
        className="confirm-modal"
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-label={req.message}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="confirm-msg">{req.message}</p>
        <div className="confirm-actions">
          {!req.alert && (
            <button className="mini ghost" onClick={() => onClose(false)}>
              {t('cancel')}
            </button>
          )}
          <button
            className={req.danger ? 'mini c-danger' : 'mini primary'}
            onClick={() => onClose(true)}
          >
            {req.confirmLabel ?? t('confirmOk')}
          </button>
        </div>
      </div>
    </div>
  );
}
