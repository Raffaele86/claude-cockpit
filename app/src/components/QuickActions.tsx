import type { QuickActionEntry } from '../protocol';

export function QuickActions({ actions, disabled, onRun }: { actions: QuickActionEntry[]; disabled: boolean; onRun: (text: string) => void }) {
  if (actions.length === 0) return null;
  return (
    <div className="quickactions">
      {actions.map((a) => (
        <button key={a.label} className="qa" disabled={disabled} onClick={() => onRun(a.text)} title={a.text}>
          {a.label}
        </button>
      ))}
    </div>
  );
}
