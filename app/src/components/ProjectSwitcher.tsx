import { useState, type ReactNode } from 'react';
import type { ProjectEntry } from '../protocol';
import { t } from '../strings';
import { Icon, type IconName } from './icons';
import { ProjectIcon, PROJECT_ICONS, PROJECT_COLORS } from './ProjectIcon';

interface Props {
  projects: ProjectEntry[];
  active: string;
  busy: Record<string, boolean>;
  onSelect: (path: string) => void;
  onAdd: (entry: ProjectEntry) => void; // upsert per path
  onRemove: (path: string) => void;
  children?: ReactNode; // navigatore file, sotto la lista progetti
  width?: number; // larghezza ridimensionabile (desktop)
}

export function ProjectSwitcher({ projects, active, busy, onSelect, onAdd, onRemove, children, width }: Props) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // path del progetto in modifica
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<IconName>('folder');
  const [color, setColor] = useState(PROJECT_COLORS[0]);

  function closeForm() {
    setAdding(false);
    setEditing(null);
    setPath('');
    setName('');
    setIcon('folder');
    setColor(PROJECT_COLORS[0]);
  }

  function startEdit(p: ProjectEntry) {
    setAdding(false);
    setEditing(p.path);
    setPath(p.path);
    setName(p.name);
    setIcon(PROJECT_ICONS.includes(p.icon as IconName) ? (p.icon as IconName) : 'folder');
    setColor(p.color && PROJECT_COLORS.includes(p.color) ? p.color : PROJECT_COLORS[0]);
  }

  function confirmForm() {
    if (!path.trim()) return;
    const p = path.trim();
    onAdd({ path: p, name: name.trim() || (p.split('/').filter(Boolean).at(-1) ?? p), icon, color });
    closeForm();
  }

  const formOpen = adding || editing !== null;

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
          <span className="rail-icon">
            <ProjectIcon icon={p.icon} color={p.color} />
          </span>
          <span className="rail-name">{p.name}</span>
          {busy[p.path] && <span className="rail-busy" />}
          <button
            className="rail-x rail-pencil"
            title={t('editProject')}
            onClick={(e) => {
              e.stopPropagation();
              startEdit(p);
            }}
          >
            <Icon name="pencil" size={12} />
          </button>
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
      {formOpen ? (
        <div className="rail-add-form">
          <input placeholder={t('pathPlaceholder')} value={path} readOnly={editing !== null} onChange={(e) => setPath(e.target.value)} />
          <input placeholder={t('namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
          <div className="icon-grid">
            {PROJECT_ICONS.map((ic) => (
              <button
                key={ic}
                className={ic === icon ? 'mini on btn-icon' : 'mini ghost btn-icon'}
                title={ic}
                onClick={() => setIcon(ic)}
              >
                <Icon name={ic} size={13} />
              </button>
            ))}
          </div>
          <div className="swatch-row">
            {PROJECT_COLORS.map((c) => (
              <button key={c} className={c === color ? 'swatch on' : 'swatch'} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
          <div className="rail-add-actions">
            <button className="mini primary" onClick={confirmForm}>{editing ? t('save') : t('add')}</button>
            <button className="mini ghost" onClick={closeForm}>{t('cancel')}</button>
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
