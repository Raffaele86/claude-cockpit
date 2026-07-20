#!/usr/bin/env node
/**
 * Estrae da theme.css tutte le regole che riguardano un insieme di classi,
 * in ordine di file e con il contesto @media, cosi' che la riscrittura di un
 * componente parta dalla materia prima invece che da una lettura a occhio di
 * 2763 righe scritte a strati cronologici.
 *
 *   node scripts/css-extract.mjs topbar brand status dot pill-wrap
 *   node scripts/css-extract.mjs --prefix mcp
 *
 * Le regole sono stampate cosi' come sono; dove un selettore compare piu' volte
 * lo si vede subito, ed e' `css-resolve.mjs` a dire quale valore vince.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const byPrefix = args.includes('--prefix');
const names = args.filter((a) => !a.startsWith('--'));
if (!names.length) {
  console.error('uso: css-extract.mjs <classe...>  |  --prefix <pref...>');
  process.exit(2);
}

const wanted = (cls) =>
  byPrefix ? names.some((p) => cls === p || cls.startsWith(p + '-')) : names.includes(cls);

const lines = readFileSync(join(ROOT, 'src/theme.css'), 'utf8').split('\n');

let selBuf = '', selLine = 0, depth = 0, block = null, out = [];
const ctxStack = [];

for (let i = 0; i < lines.length; i++) {
  const raw = lines[i];
  const line = raw.trim();
  const ln = i + 1;

  if (block) {
    block.body.push(raw);
    if (line.startsWith('}')) {
      const classes = [...block.sel.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
      if (classes.some(wanted)) out.push(block);
      block = null;
      depth--;
    }
    continue;
  }

  const at = line.match(/^@(media|supports|container)\s*([^{]*)\{/);
  if (at) { ctxStack.push(`@${at[1]} ${at[2].trim()}`); depth++; continue; }
  if (line.startsWith('}')) {
    if (ctxStack.length && depth === ctxStack.length) ctxStack.pop();
    depth = Math.max(0, depth - 1);
    continue;
  }
  if (line.startsWith('@') || line.startsWith('/*') || line.startsWith('*') || !line) continue;

  const open = line.indexOf('{');
  if (open < 0) {
    if (!line.includes(':') && !line.endsWith(';')) {
      if (!selBuf) selLine = ln;
      selBuf += ' ' + line;
    }
    continue;
  }
  const sel = (selBuf + ' ' + line.slice(0, open)).trim().replace(/\s+/g, ' ');
  const start = selBuf ? selLine : ln;
  selBuf = '';
  depth++;
  block = { sel, ctx: ctxStack.join(' ') || null, line: start, body: [raw] };
  if (line.slice(open + 1).includes('}')) {
    const classes = [...sel.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
    if (classes.some(wanted)) out.push(block);
    block = null;
    depth--;
  }
}

for (const b of out) {
  console.log(`/* theme.css:${b.line}${b.ctx ? '  ' + b.ctx : ''} */`);
  console.log(b.body.join('\n'));
  console.log('');
}
console.error(`${out.length} blocchi estratti per: ${names.join(' ')}`);
