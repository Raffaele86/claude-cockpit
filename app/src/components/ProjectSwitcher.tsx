import { useState, type ReactNode } from 'react';
import type { ProjectEntry } from '../protocol';
import { t } from '../strings';

interface Props {
  projects: ProjectEntry[];
  active: string;
  busy: Record<string, boolean>;
  onSelect: (path: string) => void;
  onAdd: (entry: ProjectEntry) => void;
  onRemove: (path: string) => void;
  children?: ReactNode; // navigatore file, sotto la lista progetti
  width?: number; // larghezza ridimensionabile (desktop)
}

export function ProjectSwitcher({ projects, active, busy, onSelect, onAdd, onRemove, children, width }: Props) {
  const [adding, setAdding] = useState(false);
  const [path, setPath] = useState('');
  const [name, setName] = useState('');

  function confirmAdd() {
    if (!path.trim()) return;
    const p = path.trim();
    onAdd({ path: p, name: name.trim() || (p.split('/').filter(Boolean).at(-1) ?? p), icon: '📁' });
    setPath('');
    setName('');
    setAdding(false);
  }

  return (
    <nav className="rail" style={width ? { width } : undefined}>
      <div className="rail-section">{t('projectsSection')}</div>
      {projects.map((p) => (
        <div
          key={p.path}
          className={`rail-item ${p.path === active ? 'on' : ''}`}
          onClick={() => onSelect(p.path)}
          title={p.path}
        >
          <span className="rail-icon">{p.icon ?? '📁'}</span>
          <span className="rail-name">{p.name}</span>
          {busy[p.path] && <span className="rail-busy" />}
          <button
            className="rail-x"
            title={t('removeFromList')}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(p.path);
            }}
          >
            ×
          </button>
        </div>
      ))}
      {adding ? (
        <div className="rail-add-form">
          <input placeholder={t('pathPlaceholder')} value={path} onChange={(e) => setPath(e.target.value)} />
          <input placeholder={t('namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
          <div className="rail-add-actions">
            <button onClick={confirmAdd}>{t('add')}</button>
            <button onClick={() => setAdding(false)}>{t('cancel')}</button>
          </div>
        </div>
      ) : (
        <button className="rail-add" onClick={() => setAdding(true)}>
          {t('addProject')}
        </button>
      )}
      {children}
    </nav>
  );
}
