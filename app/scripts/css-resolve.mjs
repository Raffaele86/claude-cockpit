#!/usr/bin/env node
/**
 * Risolutore della cascata (piano "Strumentazione", 2026-07-20).
 *
 * theme.css e' scritto a strati cronologici: 45 selettori sono dichiarati piu'
 * volte e vince l'ultimo, in silenzio. Portando gli stili leggendo il file dall'alto
 * si rischia di copiare il PERDENTE — un errore quasi invisibile in review che
 * produce esattamente l'effetto "scritto in momenti diversi" che si vuole curare.
 *
 * Questo script stampa, per un selettore, tutti i suoi blocchi in ordine di file e
 * poi lo stato EFFETTIVO (ultima dichiarazione di ogni proprieta' che vince),
 * annotato con la riga di provenienza.
 *
 * Uso:
 *   node scripts/css-resolve.mjs '.composer'
 *   node scripts/css-resolve.mjs --all      # tutti i selettori duplicati
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CSS = join(ROOT, 'src/theme.css');
const args = process.argv.slice(2);
const ALL = args.includes('--all');
const TARGET = args.find((a) => !a.startsWith('--'));

if (!ALL && !TARGET) {
  console.error("uso: css-resolve.mjs '<selettore>'  |  --all");
  process.exit(2);
}

/* Parser a blocchi: accumula i selettori multi-riga, tiene il contesto @media. */
const src = readFileSync(CSS, 'utf8').split('\n');
const blocks = []; // {sel, ctx, line, decls: [[prop, val, line]]}
let selBuf = '', selLine = 0, depth = 0, inBlock = null;
const ctxStack = [];

src.forEach((raw, i) => {
  const line = raw.trim();
  const ln = i + 1;

  if (inBlock) {
    if (line.startsWith('}')) {
      blocks.push(inBlock);
      inBlock = null;
      depth--;
      return;
    }
    for (const d of line.split(';')) {
      const m = d.match(/^\s*([a-z-]+)\s*:\s*(.+?)\s*$/i);
      if (m) inBlock.decls.push([m[1], m[2], ln]);
    }
    return;
  }

  const at = line.match(/^@(media|supports|container)\s*([^{]*)\{/);
  if (at) { ctxStack.push(`@${at[1]} ${at[2].trim()}`); depth++; return; }
  if (line.startsWith('}')) {
    if (ctxStack.length && depth === ctxStack.length) ctxStack.pop();
    depth = Math.max(0, depth - 1);
    return;
  }
  if (line.startsWith('@') || line.startsWith('/*') || line.startsWith('*') || !line) return;

  const open = line.indexOf('{');
  if (open < 0) {
    if (!line.includes(':') && !line.endsWith(';')) {
      if (!selBuf) selLine = ln;
      selBuf += ' ' + line;
    }
    return;
  }
  const sel = (selBuf + ' ' + line.slice(0, open)).trim().replace(/\s+/g, ' ');
  const startLine = selBuf ? selLine : ln;
  selBuf = '';
  depth++;
  inBlock = { sel, ctx: ctxStack.join(' ') || 'root', line: startLine, decls: [] };
  // blocco su riga singola: ".x { a: b; }"
  const rest = line.slice(open + 1);
  if (rest.includes('}')) {
    for (const d of rest.slice(0, rest.indexOf('}')).split(';')) {
      const m = d.match(/^\s*([a-z-]+)\s*:\s*(.+?)\s*$/i);
      if (m) inBlock.decls.push([m[1], m[2], ln]);
    }
    blocks.push(inBlock);
    inBlock = null;
    depth--;
  }
});

/* Un selettore puo' comparire in una lista: ".a, .b { }" vale per entrambi. */
const matching = (want) =>
  blocks.filter((b) => b.sel.split(',').some((p) => p.trim().replace(/\s+/g, ' ') === want));

const report = (want) => {
  const hits = matching(want);
  if (!hits.length) return console.log(`\n${want} — nessun blocco trovato`);

  console.log(`\n\x1b[1m${want}\x1b[0m  —  ${hits.length} blocc${hits.length > 1 ? 'hi' : 'o'}`);
  for (const b of hits) {
    const where = b.ctx === 'root' ? '' : `  ${b.ctx}`;
    console.log(`  \x1b[2m riga ${b.line}${where}\x1b[0m`);
    for (const [p, v] of b.decls) console.log(`      ${p}: ${v}`);
  }

  // stato effettivo per contesto: l'ultima dichiarazione di ogni proprieta' vince
  const byCtx = new Map();
  for (const b of hits) {
    if (!byCtx.has(b.ctx)) byCtx.set(b.ctx, new Map());
    for (const [p, v, ln] of b.decls) byCtx.get(b.ctx).set(p, [v, ln]);
  }
  for (const [ctx, props] of byCtx) {
    console.log(`  \x1b[32m→ EFFETTIVO${ctx === 'root' ? '' : ' ' + ctx}\x1b[0m`);
    for (const [p, [v, ln]] of props) console.log(`      ${p}: ${v}   \x1b[2m(riga ${ln})\x1b[0m`);
  }
};

if (ALL) {
  const seen = new Map();
  for (const b of blocks)
    for (const part of b.sel.split(',')) {
      const norm = part.trim().replace(/\s+/g, ' ');
      if (!norm.includes('.')) continue;
      const k = `${b.ctx}|${norm}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
  const dup = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k.split('|')[1]);
  for (const s of [...new Set(dup)].sort()) report(s);
  console.log(`\n${new Set(dup).size} selettori duplicati risolti.\n`);
} else {
  report(TARGET);
}
