// Osservabilità engine: memoria (cgroup systemd) + albero processi discendenti, attribuiti alle
// sessioni (pty/sdk/mcp) per la UI di monitoring e per il kill mirato (proc_kill).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { EngineProc, EngineStats } from './protocol.js';

const CMD_MAX = 120; // troncamento args per il campo cmd

interface PsRow {
  pid: number;
  ppid: number;
  rss: number; // KB
  etime: string;
  args: string;
}

/** `ps -e -o pid=,ppid=,rss=,etime=,args=` senza shell: righe di tutto il sistema. */
function psSnapshot(): PsRow[] {
  const out = execFileSync('ps', ['-e', '-o', 'pid=,ppid=,rss=,etime=,args='], { encoding: 'utf8' });
  const rows: PsRow[] = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    rows.push({ pid: Number(m[1]), ppid: Number(m[2]), rss: Number(m[3]), etime: m[4], args: m[5] });
  }
  return rows;
}

/** Discendenti di `rootPid` (esclusa la radice), risalendo ppid→figli. */
function descendantsOf(rows: PsRow[], rootPid: number): PsRow[] {
  const byPpid = new Map<number, PsRow[]>();
  for (const r of rows) {
    const list = byPpid.get(r.ppid);
    if (list) list.push(r);
    else byPpid.set(r.ppid, [r]);
  }
  const out: PsRow[] = [];
  const stack = [...(byPpid.get(rootPid) ?? [])];
  while (stack.length > 0) {
    const r = stack.pop()!;
    out.push(r);
    stack.push(...(byPpid.get(r.pid) ?? []));
  }
  return out;
}

/** true se `pid` è un discendente vivo dell'engine (ricalcolo fresco, per proc_kill). */
export function isDescendant(pid: number): boolean {
  if (pid === process.pid) return false;
  return descendantsOf(psSnapshot(), process.pid).some((r) => r.pid === pid);
}

/** Percorso cgroup dell'engine, ricavato da /proc/self/cgroup (riga "0::<path>") — niente uid hardcoded. */
function cgroupMemPath(name: string): string | undefined {
  try {
    const raw = readFileSync('/proc/self/cgroup', 'utf8');
    const line = raw.split('\n').find((l) => l.startsWith('0::'));
    const path = line?.slice(3);
    if (!path) return undefined;
    return `/sys/fs/cgroup${path}/${name}`;
  } catch {
    return undefined;
  }
}

function readCgroupMb(name: string): number | undefined {
  const path = cgroupMemPath(name);
  if (!path) return undefined;
  try {
    const raw = readFileSync(path, 'utf8').trim();
    if (raw === 'max') return undefined;
    const bytes = Number(raw);
    return Number.isFinite(bytes) ? Math.round(bytes / (1024 * 1024)) : undefined;
  } catch {
    return undefined;
  }
}

const SDK_RE = /--permission-prompt-tool\s+stdio|\bclaude-agent-sdk\b/;
const MCP_RE = /mcp|@modelcontextprotocol|npm exec/;

/** Snapshot memoria engine + albero processi figli, classificati per sessione.
 *  `version`: ENGINE_VERSION (package.json), come in auth_ok.
 *  `ptyPids`: pid → chiave progetto dei canali pty attivi (registro tenuto in server.ts). */
export function collectStats(version: string, ptyPids: Map<number, string>): EngineStats {
  const rows = psSnapshot();
  const self = rows.find((r) => r.pid === process.pid);
  const desc = descendantsOf(rows, process.pid);
  const byPpid = new Map<number, PsRow[]>();
  for (const r of rows) {
    const list = byPpid.get(r.ppid);
    if (list) list.push(r);
    else byPpid.set(r.ppid, [r]);
  }

  // Classificazione: figli diretti dell'engine prima, poi eredità verso i nipoti (mcp vince sempre).
  const kindOf = new Map<number, { kind: EngineProc['kind']; project?: string }>();
  const classify = (r: PsRow, inherited?: { kind: EngineProc['kind']; project?: string }): { kind: EngineProc['kind']; project?: string } => {
    if (MCP_RE.test(r.args)) return { kind: 'mcp' };
    const ptyProject = ptyPids.get(r.pid);
    if (ptyProject) return { kind: 'pty', project: ptyProject };
    if (r.ppid === process.pid && SDK_RE.test(r.args)) return { kind: 'sdk' };
    if (inherited) return inherited;
    return { kind: 'other' };
  };
  // Visita in ordine topologico (radice → foglie) partendo dai figli diretti, così l'eredità è coerente.
  const queue = [...(byPpid.get(process.pid) ?? []).map((r) => ({ row: r, inherited: undefined as { kind: EngineProc['kind']; project?: string } | undefined }))];
  while (queue.length > 0) {
    const { row, inherited } = queue.shift()!;
    const c = classify(row, inherited);
    kindOf.set(row.pid, c);
    for (const child of byPpid.get(row.pid) ?? []) queue.push({ row: child, inherited: c });
  }

  const procs: EngineProc[] = desc.map((r) => {
    const c = kindOf.get(r.pid) ?? { kind: 'other' as const };
    return {
      pid: r.pid,
      rssMb: Math.round(r.rss / 1024),
      etime: r.etime,
      cmd: r.args.slice(0, CMD_MAX),
      kind: c.kind,
      project: c.project,
    };
  });

  return {
    version,
    pid: process.pid,
    rssMb: self ? Math.round(self.rss / 1024) : 0,
    currentMb: readCgroupMb('memory.current'),
    peakMb: readCgroupMb('memory.peak'),
    maxMb: readCgroupMb('memory.max'),
    uptimeSec: Math.round(process.uptime()),
    procs,
  };
}
