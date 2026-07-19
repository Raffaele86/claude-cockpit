// Integrazione ToDoMio (dashboard todo personale). Config in ~/.claude-cockpit/todomio.json
// (shape { "url", "token"?, "tokenPath"? }); file assente = 'ToDoMio non configurato' (feature spenta).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { COCKPIT_DIR } from './auth.js';
import type { TodomioTask } from './protocol.js';

const NOT_CONFIGURED = 'ToDoMio non configurato';
const TIMEOUT_MS = 5_000;
const PROJECTS_CACHE_MS = 5 * 60_000;

interface TodomioConfig {
  url: string;
  token?: string;
  tokenPath?: string;
}

interface RawTask {
  id: string;
  projectId?: string;
  title: string;
  priority?: string;
  dueAt?: string;
}

interface RawProject {
  id: string;
  slug: string;
}

let projectsCache: { at: number; byId: Map<string, string> } | null = null;

function expandHome(p: string): string {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}

function loadConfig(): TodomioConfig | null {
  try {
    const cfg = JSON.parse(readFileSync(join(COCKPIT_DIR, 'todomio.json'), 'utf8')) as TodomioConfig;
    if (!cfg.url) return null;
    return cfg;
  } catch {
    return null;
  }
}

function resolveToken(cfg: TodomioConfig): string | undefined {
  if (cfg.token) return cfg.token;
  if (cfg.tokenPath) {
    try {
      const raw = JSON.parse(readFileSync(expandHome(cfg.tokenPath), 'utf8')) as { token?: string };
      return raw.token;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function fetchJson(url: string, token: string | undefined, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (token) headers.authorization = `Bearer ${token}`;
  return fetch(url, { ...init, headers, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function projectSlugById(cfg: TodomioConfig, token: string | undefined): Promise<Map<string, string>> {
  if (projectsCache && Date.now() - projectsCache.at < PROJECTS_CACHE_MS) return projectsCache.byId;
  const res = await fetchJson(`${cfg.url}/api/projects`, token);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { projects?: RawProject[] };
  const byId = new Map<string, string>();
  for (const p of data.projects ?? []) byId.set(p.id, p.slug);
  projectsCache = { at: Date.now(), byId };
  return byId;
}

export async function listTodos(): Promise<{ todos: TodomioTask[]; error?: string }> {
  const cfg = loadConfig();
  if (!cfg) return { todos: [], error: NOT_CONFIGURED };
  const token = resolveToken(cfg);
  try {
    const [tasksRes, byId] = await Promise.all([
      fetchJson(`${cfg.url}/api/tasks?view=azioni`, token),
      projectSlugById(cfg, token).catch(() => new Map<string, string>()),
    ]);
    if (!tasksRes.ok) throw new Error(`HTTP ${tasksRes.status}`);
    const data = (await tasksRes.json()) as { tasks?: RawTask[] };
    const todos: TodomioTask[] = (data.tasks ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      project: t.projectId ? byId.get(t.projectId) : undefined,
      priority: t.priority,
      dueAt: t.dueAt,
    }));
    return { todos };
  } catch (err) {
    return { todos: [], error: String(err instanceof Error ? err.message : err) };
  }
}

export async function markDone(id: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = loadConfig();
  if (!cfg) return { ok: false, error: NOT_CONFIGURED };
  const token = resolveToken(cfg);
  try {
    const res = await fetchJson(`${cfg.url}/api/tasks/${id}`, token, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) };
  }
}

export async function archive(id: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = loadConfig();
  if (!cfg) return { ok: false, error: NOT_CONFIGURED };
  const token = resolveToken(cfg);
  try {
    const res = await fetchJson(`${cfg.url}/api/tasks/${id}/archive`, token, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) };
  }
}
