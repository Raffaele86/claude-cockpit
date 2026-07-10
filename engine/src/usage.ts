// Report uso token/costi. Token: dai transcript .jsonl di ogni provider (storico, sempre veri).
// Costi $: SOLO quelli registrati dall'engine in usage.jsonl a fine task (il transcript non li contiene
// e non inventiamo pricing per-modello) — quindi partono da quando la feature esiste.
import { appendFileSync, createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { COCKPIT_DIR } from './auth.js';
import type { UsageDay } from './protocol.js';

const USAGE_LOG = join(COCKPIT_DIR, 'usage.jsonl');
const WINDOW_DAYS = 30;

export interface UsageRecord {
  ts: string; // ISO
  project: string; // slug
  provider: string;
  costUsd: number;
  inTok: number;
  outTok: number;
}

export function logUsage(rec: UsageRecord): void {
  try {
    appendFileSync(USAGE_LOG, JSON.stringify(rec) + '\n');
  } catch {
    /* il log costi non deve mai rompere il task */
  }
}

type DayTokens = { inTok: number; cacheTok: number; outTok: number };
// Cache per-file: rilegge solo i transcript cambiati (mtime/size) — la prima scansione è quella costosa.
const fileCache = new Map<string, { mtimeMs: number; size: number; days: Map<string, DayTokens> }>();

async function scanFile(path: string): Promise<Map<string, DayTokens>> {
  const st = statSync(path);
  const cached = fileCache.get(path);
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) return cached.days;
  const days = new Map<string, DayTokens>();
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.includes('"type":"assistant"')) continue;
    try {
      const row = JSON.parse(line) as { type?: string; timestamp?: string; message?: { usage?: Record<string, number> } };
      if (row.type !== 'assistant' || !row.message?.usage) continue;
      const date = String(row.timestamp ?? '').slice(0, 10);
      if (!date) continue;
      const u = row.message.usage;
      const d = days.get(date) ?? { inTok: 0, cacheTok: 0, outTok: 0 };
      d.inTok += u.input_tokens || 0;
      d.cacheTok += (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      d.outTok += u.output_tokens || 0;
      days.set(date, d);
    } catch {
      /* riga malformata: salta */
    }
  }
  fileCache.set(path, { mtimeMs: st.mtimeMs, size: st.size, days });
  return days;
}

export async function usageReport(providers: Record<string, { configDir: string }>): Promise<UsageDay[]> {
  const cutoffMs = Date.now() - WINDOW_DAYS * 86_400_000;
  const cutoffDate = new Date(cutoffMs).toISOString().slice(0, 10);
  const agg = new Map<string, UsageDay>();
  const bump = (date: string, provider: string, project: string): UsageDay => {
    const key = `${date}|${provider}|${project}`;
    let d = agg.get(key);
    if (!d) {
      d = { date, provider, project, inTok: 0, cacheTok: 0, outTok: 0 };
      agg.set(key, d);
    }
    return d;
  };

  const dirs: [string, string][] = [
    ['claude', join(homedir(), '.claude')],
    ...Object.entries(providers).map(([name, c]) => [name, c.configDir] as [string, string]),
  ];
  for (const [provider, dir] of dirs) {
    const root = join(dir, 'projects');
    if (!existsSync(root)) continue;
    for (const slug of readdirSync(root)) {
      let files: string[];
      try {
        files = readdirSync(join(root, slug)).filter((f) => f.endsWith('.jsonl'));
      } catch {
        continue;
      }
      for (const f of files) {
        const path = join(root, slug, f);
        try {
          if (statSync(path).mtimeMs < cutoffMs) continue;
          for (const [date, tok] of await scanFile(path)) {
            if (date < cutoffDate) continue;
            const d = bump(date, provider, slug);
            d.inTok += tok.inTok;
            d.cacheTok += tok.cacheTok;
            d.outTok += tok.outTok;
          }
        } catch {
          /* file sparito/illeggibile: salta */
        }
      }
    }
  }

  // Costi registrati dall'engine (fonte di verità per i $).
  try {
    for (const line of readFileSync(USAGE_LOG, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as UsageRecord;
        const date = r.ts.slice(0, 10);
        if (date < cutoffDate) continue;
        const d = bump(date, r.provider, r.project);
        d.costUsd = (d.costUsd ?? 0) + (r.costUsd || 0);
      } catch {
        /* riga malformata: salta */
      }
    }
  } catch {
    /* nessun costo registrato ancora */
  }

  return [...agg.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
