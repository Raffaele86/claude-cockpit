#!/usr/bin/env node
/**
 * Guardiano della riscrittura CSS (piano "Strumentazione", 2026-07-20).
 *
 * Il renderer non ha test né typecheck: riscrivendo il foglio di stile il rischio
 * vero non e' sbagliare un colore, e' lasciare una superficie SENZA STILE e
 * scoprirlo settimane dopo su un pannello che si apre di rado.
 *
 * Quattro cancelli, tutti meccanici:
 *   1. classi usate nei .tsx ma non stilate  -> superfici scoperte (bloccante)
 *   2. selettori stilati ma non usati        -> CSS morto (informativo)
 *   3. stessa classe dichiarata piu' volte nello stesso layer -> la malattia da cui
 *      nasce il lavoro (.chat a 156 e 2073, .composer a 873/2138/2196, ...)
 *   4. disciplina dei token: niente hex nei componenti, niente rampa grezza fuori
 *      da tokens.css, niente fallback nei var()
 *
 * Uso:
 *   node scripts/css-audit.mjs                 # audita src/styles/ (il nuovo)
 *   node scripts/css-audit.mjs --css src/theme.css --baseline
 *      # audita il vecchio foglio: stampa la mappa di partenza senza far fallire
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const argOf = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const BASELINE = args.includes('--baseline');
const CSS_TARGET = argOf('--css', 'src/styles');

/* ------------------------------------------------------------------ *
 * Classi che NON compaiono mai in un className= e che il tema deve
 * comunque coprire. Dimenticarle significa spedire un terminale o una
 * prosa senza stile.
 * ------------------------------------------------------------------ */
const EXTERNAL = new Set([
  // DOM iniettato da xterm.js
  'xterm', 'xterm-viewport', 'xterm-screen', 'xterm-rows', 'xterm-cursor',
  'xterm-cursor-block', 'xterm-cursor-bar', 'xterm-cursor-underline',
  'xterm-cursor-outline', 'xterm-cursor-blink', 'xterm-selection',
  'xterm-decoration', 'xterm-decoration-overview-ruler', 'xterm-scroll-area',
  'xterm-char-measure-element', 'xterm-helpers', 'xterm-helper-textarea',
  'xterm-accessibility', 'xterm-message', 'xterm-dom-renderer-owner-1',
  'xterm-focus', 'focus', 'xterm-underline-1', 'xterm-underline-2',
  'xterm-underline-3', 'xterm-underline-4', 'xterm-underline-5',
]);

/* Classi generate dinamicamente in modo che il parser non puo' vedere
 * (template literal con espressione, valori da config, ecc.).
 * Ogni voce va giustificata: e' un buco nella rete, non una comodita'. */
const ALLOW_UNSTYLED = new Set([]);

const walk = (dir, exts, out = []) => {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.includes(extname(p))) out.push(p);
  }
  return out;
};

/* ------------------------------------------------------------------ *
 * Cancello 1 — inventario delle classi usate nei sorgenti
 * Prende ogni stringa letterale dentro className=..., inclusi i template
 * literal e i ternari, e la spezza sugli spazi.
 * ------------------------------------------------------------------ */
const usedBy = new Map(); // classe -> Set(file)
for (const file of walk(join(ROOT, 'src'), ['.tsx', '.ts'])) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  // span di className=  fino alla chiusura bilanciata di {...} o alla stringa
  const spans = src.matchAll(/className\s*=\s*(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|'[^']*')/g);
  for (const [, span] of spans) {
    for (const m of span.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)) {
      // nei template literal le espressioni ${...} vanno RIMOSSE, non spezzate:
      // altrimenti si raccoglie il nome della variabile al posto del valore.
      const chunk = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, ' ');
      for (const cls of chunk.split(/\s+/)) {
        const c = cls.trim();
        if (!c || !/^[a-zA-Z][\w-]*$/.test(c)) continue;
        if (!usedBy.has(c)) usedBy.set(c, new Set());
        usedBy.get(c).add(rel);
      }
    }
  }
  // le stringhe passate direttamente al componente Icon o simili non contano
}

/* ------------------------------------------------------------------ *
 * Cancello 2 — inventario dei selettori definiti nel CSS
 * ------------------------------------------------------------------ */
const cssFiles = statSync(join(ROOT, CSS_TARGET)).isDirectory()
  ? walk(join(ROOT, CSS_TARGET), ['.css'])
  : [join(ROOT, CSS_TARGET)];

const declaredAt = new Map(); // classe -> [{file, line, layer}]
const selectorAt = new Map(); // "layer|selettore normalizzato" -> ["file:riga"]
const hexInComponents = [];
const rawRampOutsideTokens = [];
const varFallbacks = [];

for (const file of cssFiles) {
  const rel = relative(ROOT, file);
  const isTokens = /tokens\.css$/.test(rel);
  const lines = readFileSync(file, 'utf8').split('\n');
  let layer = 'implicit';
  let depth = 0;
  let selBuf = '';        // accumula i selettori multi-riga (".a,\n.b {")
  let selLine = 0;
  const ctxStack = [];    // condizioni @media/@supports attive

  lines.forEach((raw, i) => {
    const line = raw.trim();
    const ln = i + 1;

    const layerDecl = line.match(/^@layer\s+([\w-]+)\s*\{/);
    if (layerDecl) layer = layerDecl[1];
    const atRule = line.match(/^@(media|supports|container)\s*([^{]*)\{/);
    if (atRule) ctxStack.push(`${atRule[1]} ${atRule[2].trim()}`);
    if (line.startsWith('}') && ctxStack.length && depth === ctxStack.length) ctxStack.pop();

    // cancello 4
    if (!isTokens) {
      if (/#[0-9a-fA-F]{3,8}\b/.test(line) && !line.startsWith('/*') && !line.startsWith('*'))
        hexInComponents.push(`${rel}:${ln}  ${line}`);
      if (/var\(\s*--n-/.test(line)) rawRampOutsideTokens.push(`${rel}:${ln}  ${line}`);
    }
    if (/var\(\s*--[\w-]+\s*,/.test(line)) varFallbacks.push(`${rel}:${ln}  ${line}`);

    // Selettori: si accumulano fino alla graffa, perche' una lista puo' stare
    // su piu' righe (".tool-input,\n.perm-input { ... }") — leggere solo la riga
    // con la graffa perderebbe tutti i selettori precedenti della lista.
    if (!line.startsWith('@') && !line.startsWith('/*') && !line.startsWith('*')) {
      const open = line.indexOf('{');
      if (open < 0) {
        if (line && !line.includes(':') && !line.endsWith(';') && !line.startsWith('}')) {
          if (!selBuf) selLine = ln;
          selBuf += ' ' + line;
        }
      } else {
        const sel = (selBuf + ' ' + line.slice(0, open)).trim();
        const at = selBuf ? selLine : ln;
        selBuf = '';
        for (const [, cls] of sel.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
          if (!declaredAt.has(cls)) declaredAt.set(cls, []);
          declaredAt.get(cls).push({ file: rel, line: at, layer });
        }
        // Duplicati veri = STESSO selettore completo, nello STESSO layer e nello
        // STESSO contesto @media. `.chat` dentro `.chat .md pre` non e' un
        // duplicato di `.chat`; `.rail` desktop e `.rail` mobile nemmeno.
        const ctx = ctxStack.join(' && ') || 'root';
        for (const part of sel.split(',')) {
          const norm = part.trim().replace(/\s+/g, ' ');
          if (!norm || !norm.includes('.')) continue;
          const key = `${layer}|${ctx}|${norm}`;
          if (!selectorAt.has(key)) selectorAt.set(key, []);
          selectorAt.get(key).push(`${rel}:${at}`);
        }
      }
    }
    depth += (raw.match(/\{/g) ?? []).length - (raw.match(/\}/g) ?? []).length;
  });
}

/* ------------------------------------------------------------------ *
 * Referto
 * ------------------------------------------------------------------ */
const styled = new Set(declaredAt.keys());
const used = new Set(usedBy.keys());

const unstyled = [...used].filter(
  (c) => !styled.has(c) && !EXTERNAL.has(c) && !ALLOW_UNSTYLED.has(c),
).sort();
const dead = [...styled].filter((c) => !used.has(c) && !EXTERNAL.has(c)).sort();
const dupes = [...selectorAt.entries()]
  .filter(([, where]) => where.length > 1)
  .map(([key, where]) => {
    const [layer, ctx, sel] = key.split('|');
    return { sel, layer: ctx === 'root' ? layer : `${layer} @${ctx}`, where };
  })
  .sort((a, b) => b.where.length - a.where.length || a.sel.localeCompare(b.sel));

const h = (s) => `\n\x1b[1m${s}\x1b[0m`;
console.log(h('INVENTARIO'));
console.log(`  classi usate nei sorgenti : ${used.size}`);
console.log(`  classi stilate nel CSS    : ${styled.size}`);
console.log(`  file CSS auditati         : ${cssFiles.length}  (${CSS_TARGET})`);

console.log(h(`1. SUPERFICI SCOPERTE — usate ma non stilate (${unstyled.length})`));
for (const c of unstyled) console.log(`  .${c}  ←  ${[...usedBy.get(c)].join(', ')}`);
if (!unstyled.length) console.log('  nessuna');

console.log(h(`2. CSS MORTO — stilato ma non usato (${dead.length})`));
console.log(dead.length ? `  ${dead.map((c) => '.' + c).join(' ')}` : '  nessuno');

console.log(h(`3. SELETTORI DUPLICATI nello stesso layer (${dupes.length})`));
for (const { sel, layer, where } of dupes)
  console.log(`  ${sel}  [${layer}]  ×${where.length}  ${where.join('  ')}`);
if (!dupes.length) console.log('  nessuno');

console.log(h('4. DISCIPLINA DEI TOKEN'));
console.log(`  hex fuori da tokens.css        : ${hexInComponents.length}`);
console.log(`  rampa --n-* fuori da tokens.css: ${rawRampOutsideTokens.length}`);
console.log(`  var() con fallback             : ${varFallbacks.length}`);
for (const l of varFallbacks.slice(0, 12)) console.log(`     ${l}`);
if (varFallbacks.length > 12) console.log(`     … e altri ${varFallbacks.length - 12}`);

if (BASELINE) {
  console.log(h('MODALITA BASELINE — nessun cancello applicato'));
  process.exit(0);
}

const fail = [];
if (unstyled.length) fail.push(`${unstyled.length} superfici senza stile`);
if (dupes.length) fail.push(`${dupes.length} classi duplicate nello stesso layer`);
if (hexInComponents.length) fail.push(`${hexInComponents.length} hex fuori dai token`);
if (rawRampOutsideTokens.length) fail.push(`${rawRampOutsideTokens.length} usi della rampa grezza`);
if (varFallbacks.length) fail.push(`${varFallbacks.length} var() con fallback`);

if (fail.length) {
  console.error(`\n\x1b[31mCSS AUDIT FALLITO:\x1b[0m ${fail.join(' · ')}\n`);
  process.exit(1);
}
console.log('\n\x1b[32mCSS AUDIT OK\x1b[0m\n');
