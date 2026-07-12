import { Icon, isIconName, type IconName } from './icons';

/** Icone proponibili per i progetti (subset del set Icon). */
export const PROJECT_ICONS: IconName[] = [
  'folder',
  'home',
  'file',
  'book',
  'globe',
  'star',
  'terminal',
  'rocket',
  'sparkle',
  'branch',
  'camera',
  'chart',
  'message',
  'pin',
  'clipboard',
  'pulse',
];

/** Tinte progetto in armonia col tema (corallo, verde, azzurro, viola, rosa, ambra, teal, grigio). */
export const PROJECT_COLORS = ['#d97757', '#7fbf7f', '#6aa9d8', '#a78bda', '#d883a6', '#d9a94a', '#55b3a8', '#a6a39a'];

/** Icona di un progetto: nome del set → SVG tinto; emoji legacy → testo; assente → folder. */
export function ProjectIcon({ icon, color, size = 15 }: { icon?: string; color?: string; size?: number }) {
  if (icon && isIconName(icon)) {
    return (
      <span className="proj-glyph" style={{ color: color ?? 'var(--text-dim)' }}>
        <Icon name={icon} size={size} />
      </span>
    );
  }
  if (icon) return <span className="proj-glyph">{icon}</span>;
  return (
    <span className="proj-glyph">
      <Icon name="folder" size={size} />
    </span>
  );
}
