import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import { useDragWin } from './useDragWin';

interface Props {
  icon: IconName;
  title: ReactNode;
  onClose: () => void;
  className?: string; // variante/offset: 'doctor doctor-win', 'md-viewer', …
  actions?: ReactNode; // controlli extra nella barra (copy, salva, warn…)
  children: ReactNode;
}

/** Guscio unico delle finestre flottanti: header trascinabile con icona+titolo+chiudi,
 *  stesso raggio/ombra/animazione per tutti i pannelli. */
export function FloatPanel({ icon, title, onClose, className, actions, children }: Props) {
  const { ref, style, onBarMouseDown } = useDragWin();
  return (
    <div className={`float-win ${className ?? ''}`} ref={ref} style={style}>
      <div className="float-bar" onMouseDown={onBarMouseDown}>
        <Icon name={icon} />
        <span className="float-title">{title}</span>
        {actions}
        <button className="mini ghost btn-icon" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </div>
  );
}
