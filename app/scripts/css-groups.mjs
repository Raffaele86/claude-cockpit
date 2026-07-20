#!/usr/bin/env node
/**
 * Ripartizione delle classi nei file di styles/. Serve a due cose:
 *  1. dare a ogni file la sua materia prima (`--emit <dir>` scrive un estratto
 *     per gruppo, prendendo le regole vere da theme.css)
 *  2. garantire che NESSUNA classe resti orfana: una classe non assegnata e'
 *     una superficie che nella riscrittura resterebbe senza stile.
 *
 *   node scripts/css-groups.mjs            # verifica copertura
 *   node scripts/css-groups.mjs --emit /percorso/dir
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;

/** gruppo -> prefissi/nomi esatti. L'ordine conta: il primo che matcha vince. */
export const GROUPS = {
  permission: ['perm', 'p-allow', 'p-deny', 'p-always', 'p-edit', 'p-cancel'],
  palette: ['cpal'],
  menu: ['sel', 'omenu', 'ctx-menu', 'ctx-item', 'ctx-backdrop', 'model-combo', 'model-select',
         'model-static', 'model-free', 'effort-select', 'smenu', 'provider-toggle', 'prov',
         'slash-item', 'slash-palette'],
  panels: ['float-win', 'float-bar', 'float-title', 'doctor', 'doc', 'settings', 'set',
           'usage', 'sys', 'todos', 'todo', 'inbox', 'cp-label', 'cp-win', 'md-viewer'],
  sessions: ['session', 'cat', 'scheduler', 'tech', 'warm', 'hot', 'cockpit', 'ai', 'css'],
  filenav: ['fnav', 'crumb', 'crumb-sep', 'drive', 'file', 'current', 'drop-hover', 'tname', 'tchevron'],
  rail: ['rail', 'proj-glyph', 'project', 'proj'],
  tabs: ['tabs', 'tab', 'view-toggle'],
  topbar: ['topbar', 'brand', 'status', 'pill-wrap', 'pill-part', 'pill-sep', 'session-pill'],
  terminal: ['terminal-host', 'term-panel', 'term-bar', 'cli-wrap', 'cli-mic', 'cli-restart',
             'cli', 'recording'],
  toolcard: ['tool', 'diff', 'add', 'del', 'tsummary', 'tstatus', 'ok', 'bad', 'running',
             'completed', 'in', 'in_progress', 'gutter'],
  chat: ['chat', 'turn', 'bubble', 'user', 'assistant', 'asst-body', 'asst-mark', 'role',
         'md', 'md-link', 'md-open-btn', 'copy-btn', 'code-copy', 'thinking-block', 'thinking-chip'],
  composer: ['composer', 'mic', 'mic-msg', 'send', 'stop', 'queue-chip', 'img-chip', 'img-badge',
             'modebar', 'mode', 'statusline', 'sl-hot', 'quickactions', 'qa', 'ctx'],
  mcp: ['mcp'],
  primitives: ['mini', 'ghost', 'primary', 'btn-icon', 'kbd-chip', 'has-badge', 'badge-busy',
               'on', 'danger', 'icon', 'icon-grid', 'swatch', 'swatch-row', 'dot', 'connecting',
               'authed', 'disconnected', 'banner', 'error', 'spin', 'focus', 'open', 'up',
               'primary', 'line'],
  base: ['app', 'body', 'main', 'side', 'side-backdrop', 'mobile-only', 'empty', 'cost'],
};

const groupOf = (cls) => {
  for (const [g, pats] of Object.entries(GROUPS))
    if (pats.some((p) => cls === p || cls.startsWith(p + '-'))) return g;
  return null;
};

const theme = readFileSync(join(ROOT, 'src/theme.css'), 'utf8');
const all = [...new Set([...theme.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]))].sort();

const assigned = new Map();
const orphans = [];
for (const c of all) {
  const g = groupOf(c);
  if (!g) orphans.push(c);
  else assigned.set(c, g);
}

const byGroup = {};
for (const [c, g] of assigned) (byGroup[g] ??= []).push(c);

const emitIdx = process.argv.indexOf('--emit');
if (emitIdx >= 0) {
  const dir = process.argv[emitIdx + 1];
  mkdirSync(dir, { recursive: true });
  for (const [g, classes] of Object.entries(byGroup)) {
    const out = execFileSync('node', [join(ROOT, 'scripts/css-extract.mjs'), ...classes], {
      cwd: ROOT, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8',
    });
    writeFileSync(join(dir, `${g}.css`), out);
    console.log(`${g}.css  ${classes.length} classi  ${out.split('\n').length} righe`);
  }
} else {
  for (const [g, classes] of Object.entries(byGroup))
    console.log(`${g.padEnd(12)} ${String(classes.length).padStart(3)} classi`);
  console.log(`\ntotale assegnate: ${assigned.size}/${all.length}`);
  console.log(orphans.length ? `\x1b[31mORFANE (${orphans.length}):\x1b[0m ${orphans.join(' ')}`
                             : '\x1b[32mnessuna classe orfana\x1b[0m');
  if (orphans.length) process.exit(1);
}
