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

/** Tinte progetto: gli STESSI colori degli stati semantici, non una tavolozza a
 *  parte. Prima quattro di questi otto valori non esistevano da nessun'altra
 *  parte nel sistema — colori orfani proprio dove sono piu' visibili. Ora il
 *  pallino teal di un progetto e' letteralmente lo stesso ciano del terminale.
 *  var() funziona negli stili inline, che e' come vengono consumati
 *  (ProjectSwitcher.tsx background, ProjectIcon color). */
export const PROJECT_COLORS = [
  'var(--accent)',
  'var(--ok)',
  'var(--info)',
  'var(--busy)',
  'var(--hue-pink)',
  'var(--warn)',
  'var(--hue-teal)',
  'var(--text-2)',
];

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
