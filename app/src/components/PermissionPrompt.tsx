import { useRef, useState } from 'react';
import type { PendingPermission } from '../model';
import type { PermissionDecision } from '../protocol';
import { t } from '../strings';
import { Icon } from './icons';
import { trapTab, useDialogFocus } from './useDialogA11y';

interface Props {
  req: PendingPermission;
  onDecide: (decision: PermissionDecision, updatedInput?: Record<string, unknown>) => void;
}

export function PermissionPrompt({ req, onDecide }: Props) {
  const [editing, setEditing] = useState(false);
  const [json, setJson] = useState(() => JSON.stringify(req.input, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Il fuoco atterra sul contenitore, non sul primo bottone: qui il primo bottone
  // e' "Consenti una volta" e un Invio distratto concederebbe il permesso.
  useDialogFocus(panel);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      // Durante la modifica Esc annulla la modifica, non la richiesta: chi sta
      // scrivendo si aspetta di tornare indietro di un passo, non di negare.
      // Fuori, uscire da una richiesta di permesso e' il no, come nel CLI.
      if (editing) setEditing(false);
      else onDecide('deny');
      return;
    }
    trapTab(e, panel.current);
  }

  function confirmEdit() {
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      onDecide('edit', parsed);
    } catch (e) {
      setJsonError(String(e));
    }
  }

  return (
    <div className="perm-overlay">
      <div
        className="perm-modal"
        ref={panel}
        style={{ outline: 'none' }}
        role="alertdialog"
        aria-modal="true"
        aria-label={`${t('permTitle')} ${req.toolName}`}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="perm-title">
          <Icon name="lock" /> {t('permTitle')} <b>{req.toolName}</b>
        </div>
        {editing ? (
          <>
            <textarea className="perm-json" value={json} onChange={(e) => setJson(e.target.value)} rows={12} />
            {jsonError && <div className="perm-error">{jsonError}</div>}
            <div className="perm-actions">
              <button className="p-allow" onClick={confirmEdit}>
                {t('applyEdit')}
              </button>
              <button className="p-cancel" onClick={() => setEditing(false)}>
                {t('cancel')}
              </button>
            </div>
          </>
        ) : (
          <>
            <pre className="perm-input">{JSON.stringify(req.input, null, 2)}</pre>
            <div className="perm-actions">
              <button className="p-allow" onClick={() => onDecide('allow-once')}>
                {t('allowOnce')}
              </button>
              <button className="p-always" onClick={() => onDecide('allow-always')}>
                {t('allowAlways')}
              </button>
              <button className="p-edit" onClick={() => setEditing(true)}>
                {t('editInput')}
              </button>
              <button className="p-deny" onClick={() => onDecide('deny')}>
                {t('deny')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
