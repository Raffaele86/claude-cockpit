import type { ModelOption } from '../model';

interface Props {
  models: ModelOption[];
  current: string;
  onChange: (model: string) => void;
}

export function ModelSelect({ models, current, onChange }: Props) {
  if (models.length === 0) return <span className="model-static">{current || '…'}</span>;
  const known = models.some((m) => m.model === current);
  return (
    <select className="model-select" value={known ? current : ''} onChange={(e) => onChange(e.target.value)}>
      {!known && <option value="">{current || 'model…'}</option>}
      {models.map((m) => (
        <option key={m.model} value={m.model}>
          {m.displayName ?? m.model}
        </option>
      ))}
    </select>
  );
}
