import type { ReactNode } from 'react';
import { t } from '../strings';
import { Icon, type IconName } from './icons';
import { useDragWin } from './useDragWin';
import { trapTab, useDialogFocus } from './useDialogA11y';

interface Props {
  icon: IconName;
  title: ReactNode;
  onClose: () => void;
  /** Nome del dialogo per i lettori di schermo, quando `title` non e' una stringa. */
  ariaLabel?: string;
  className?: string; // variante/offset: 'doctor doctor-win', 'md-viewer', …
  actions?: ReactNode; // controlli extra nella barra (copy, salva, warn…)
  children: ReactNode;
}

/** Guscio unico delle finestre flottanti: header trascinabile con icona+titolo+chiudi,
 *  stesso raggio/ombra/animazione per tutti i pannelli. */
export function FloatPanel({ icon, title, onClose, ariaLabel, className, actions, children }: Props) {
  const { ref, style, onBarPointerDown } = useDragWin();
  useDialogFocus(ref);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    trapTab(e, ref.current);
  }

  return (
    <div
      className={`float-win ${className ?? ''}`}
      ref={ref}
      // outline:none perche' il contenitore riceve il fuoco solo come punto di
      // atterraggio: l'anello lo mostrano i figli, l'aspetto non cambia.
      style={{ ...style, outline: 'none' }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className="float-bar" onPointerDown={onBarPointerDown}>
        <Icon name={icon} />
        <span className="float-title">{title}</span>
        {actions}
        <button className="mini ghost btn-icon" aria-label={t('close')} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </div>
  );
}
