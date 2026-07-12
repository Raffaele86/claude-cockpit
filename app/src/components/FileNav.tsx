// Navigatore file stile Esplora Risorse: barra drive (Home + /mnt/*), breadcrumb,
// pannello singolo con ".." per salire, menu contestuale col tasto destro.
import { useEffect, useState } from 'react';
import type { CockpitClient } from '../ws';
import type { DirEntry, ProjectEntry, ServerMsg } from '../protocol';
import { ContextMenu, type MenuItem, type MenuState } from './ContextMenu';
import { t } from '../strings';
import { Icon } from './icons';

interface Props {
  client: CockpitClient;
  root: string; // home
  active: string;
  registry: ProjectEntry[];
  onSelectProject: (path: string) => void;
  onAddProject: (path: string) => void;
  onRemoveProject: (path: string) => void;
  onOpenFile: (path: string) => void;
  onAskClaude: (path: string) => void;
  onOpenTerminal: (path: string) => void;
}

const joinPath = (a: string, b: string) => `${a}/${b}`.replace(/\/+/g, '/');

/** /mnt/d/NAS/x → D:\NAS\x (per incollare in Windows). */
function toWinPath(p: string): string | null {
  const m = /^\/mnt\/([a-z])(\/.*)?$/.exec(p);
  if (!m) return null;
  return `${m[1].toUpperCase()}:${(m[2] ?? '').replaceAll('/', '\\')}`;
}

export function FileNav({
  client,
  root,
  active,
  registry,
  onSelectProject,
  onAddProject,
  onRemoveProject,
  onOpenFile,
  onAskClaude,
  onOpenTerminal,
}: Props) {
  const [entries, setEntries] = useState<Record<string, DirEntry[]>>({});
  const [cwd, setCwd] = useState(root);
  const [drives, setDrives] = useState<string[]>([]);
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    const unsub = client.subscribe((m: ServerMsg) => {
      if (m.ev === 'dir_entries') {
        if (m.path === '/mnt') setDrives(m.entries.filter((e) => e.dir && /^[a-z]$/.test(e.name)).map((e) => e.name));
        else setEntries((prev) => ({ ...prev, [m.path]: m.entries }));
      } else if (m.ev === 'file_op_done') {
        if (m.error) alert(t('opFailed')(m.error));
        refresh();
      } else if (m.ev === 'projects') {
        refresh(); // l'evidenza "project" dipende dal registry
      }
    });
    client.send({ op: 'dir_list', path: root });
    client.send({ op: 'dir_list', path: '/mnt' });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, root]);

  function refresh() {
    setCwd((c) => {
      client.send({ op: 'dir_list', path: c });
      return c;
    });
  }

  function goTo(path: string) {
    setCwd(path);
    if (!entries[path]) client.send({ op: 'dir_list', path });
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text).catch(() => {});
  }

  function openMenu(e: React.MouseEvent, full: string, entry: DirEntry) {
    e.preventDefault();
    e.stopPropagation();
    const inRegistry = registry.some((p) => p.path === full);
    const win = toWinPath(full);
    const items: MenuItem[] = [];
    if (entry.dir) {
      items.push({ icon: 'play', label: t('useAsProject'), onClick: () => onSelectProject(full) });
      items.push(
        inRegistry
          ? { icon: 'close', label: t('removeFromProjects'), onClick: () => onRemoveProject(full) }
          : { icon: 'star', label: t('addToProjects'), onClick: () => onAddProject(full) },
      );
      items.push({ icon: 'terminal', label: t('openTerminalHere'), onClick: () => onOpenTerminal(full) });
      items.push({ icon: 'message', label: t('askClaude'), onClick: () => onAskClaude(full) });
      items.push({
        icon: 'plus',
        label: t('newFolderHere'),
        onClick: () => {
          const name = prompt(t('newFolderPrompt'));
          if (name?.trim()) client.send({ op: 'file_op', kind: 'mkdir', path: full, newName: name.trim() });
        },
      });
    } else {
      if (entry.name.endsWith('.md')) items.push({ icon: 'book', label: t('openInReader'), onClick: () => onOpenFile(full) });
      items.push({ icon: 'message', label: t('askClaude'), onClick: () => onAskClaude(full) });
    }
    items.push({ icon: 'folder', label: t('revealInExplorer'), onClick: () => client.send({ op: 'file_op', kind: 'reveal', path: full }) });
    items.push({ icon: 'clipboard', label: t('copyPathMenu'), onClick: () => copy(full) });
    if (win) items.push({ icon: 'clipboard', label: t('copyWinPath'), onClick: () => copy(win) });
    items.push({
      icon: 'pencil',
      label: t('rename'),
      onClick: () => {
        const name = prompt(t('renamePrompt'), entry.name);
        if (name?.trim() && name.trim() !== entry.name) client.send({ op: 'file_op', kind: 'rename', path: full, newName: name.trim() });
      },
    });
    items.push({
      icon: 'trash',
      label: t('deleteItem'),
      danger: true,
      onClick: () => {
        if (confirm(t('confirmDelete')(entry.name, entry.dir)))
          client.send({ op: 'file_op', kind: 'delete', path: full });
      },
    });
    setMenu({ x: e.clientX, y: e.clientY, items });
  }

  // Breadcrumb: dentro la home mostra ~; sui drive mostra C: / segmenti.
  const crumbs: { label: string; path: string }[] = [];
  if (cwd.startsWith(root)) {
    crumbs.push({ label: '~', path: root });
    const rest = cwd.slice(root.length).split('/').filter(Boolean);
    let acc = root;
    for (const seg of rest) {
      acc = joinPath(acc, seg);
      crumbs.push({ label: seg, path: acc });
    }
  } else {
    const segs = cwd.split('/').filter(Boolean);
    let acc = '';
    for (let i = 0; i < segs.length; i++) {
      acc += '/' + segs[i];
      if (i === 0) continue; // salta "mnt"
      crumbs.push({ label: i === 1 ? `${segs[1].toUpperCase()}:` : segs[i], path: acc });
    }
  }
  const parent = cwd !== root && crumbs.length > 1 ? crumbs[crumbs.length - 2].path : null;
  const list = entries[cwd];

  return (
    <div className="fnav">
      <div className="rail-section">{t('filesSection')}</div>
      <div className="fnav-drives">
        <button className={cwd.startsWith(root) ? 'drive on' : 'drive'} title={root} onClick={() => goTo(root)}>
          <Icon name="home" size={13} />
        </button>
        {drives.map((d) => (
          <button
            key={d}
            className={cwd.startsWith(`/mnt/${d}`) ? 'drive on' : 'drive'}
            title={`/mnt/${d}`}
            onClick={() => goTo(`/mnt/${d}`)}
          >
            {d.toUpperCase()}:
          </button>
        ))}
      </div>
      <div className="fnav-crumbs">
        {crumbs.map((c, i) => (
          <span key={c.path}>
            {i > 0 && <span className="crumb-sep">/</span>}
            <button className="crumb" onClick={() => goTo(c.path)}>
              {c.label}
            </button>
          </span>
        ))}
      </div>
      <div className="fnav-list">
        {parent && (
          <div className="fnav-item dir" onClick={() => goTo(parent)}>
            <span className="fnav-icon"><Icon name="arrow-up" size={13} /></span>
            <span className="fnav-name">..</span>
          </div>
        )}
        {!list && <div className="fnav-loading">{t('loadingLower')}</div>}
        {list?.map((e) => {
          const full = joinPath(cwd, e.name);
          if (e.dir) {
            return (
              <div
                key={full}
                className={`fnav-item dir ${e.project ? 'project' : ''} ${full === active ? 'on' : ''}`}
                onClick={() => goTo(full)}
                onContextMenu={(ev) => openMenu(ev, full, e)}
                title={full}
              >
                <span className="fnav-icon"><Icon name={e.project ? 'rocket' : 'folder'} size={13} /></span>
                <span className="fnav-name">{e.name}</span>
                {e.project && (
                  <button
                    className="fnav-use"
                    title={t('useAsActiveTitle')}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onSelectProject(full);
                    }}
                  >
                    <Icon name="play" size={11} />
                  </button>
                )}
              </div>
            );
          }
          const isMd = e.name.endsWith('.md');
          return (
            <div
              key={full}
              className={`fnav-item file ${isMd ? 'md' : ''}`}
              onClick={isMd ? () => onOpenFile(full) : undefined}
              onContextMenu={(ev) => openMenu(ev, full, e)}
              title={isMd ? t('openInReader') : full}
            >
              <span className="fnav-icon">{isMd ? <Icon name="file" size={13} /> : '·'}</span>
              <span className="fnav-name">{e.name}</span>
            </div>
          );
        })}
        {list && list.length === 0 && <div className="fnav-loading">{t('emptyFolder')}</div>}
      </div>
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
