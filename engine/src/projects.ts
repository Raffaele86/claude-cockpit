import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { COCKPIT_DIR } from './auth.js';
import type { ProjectEntry } from './protocol.js';

const PROJECTS_PATH = join(COCKPIT_DIR, 'projects.json');
const QUICKACTIONS_PATH = join(COCKPIT_DIR, 'quickactions.json');

export interface QuickAction {
  label: string;
  text: string; // prompt o slash command da iniettare
}

export function readJson<T>(path: string, fallback: T): T {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    /* file corrotto → fallback */
  }
  return fallback;
}

export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

/** Seed neutro al primo avvio: solo la home. I progetti si aggiungono dalla UI (rail / navigator). */
function seedProjects(): ProjectEntry[] {
  return [{ name: 'home', path: homedir(), icon: '🏠' }];
}

export function loadProjects(): ProjectEntry[] {
  const existing = readJson<ProjectEntry[] | null>(PROJECTS_PATH, null);
  if (existing && Array.isArray(existing) && existing.length) return existing;
  const seed = seedProjects();
  writeJson(PROJECTS_PATH, seed);
  return seed;
}

export function upsertProject(entry: ProjectEntry): ProjectEntry[] {
  const path = resolve(entry.path);
  const list = loadProjects().filter((p) => resolve(p.path) !== path);
  list.push({ ...entry, path });
  writeJson(PROJECTS_PATH, list);
  return list;
}

export function removeProject(path: string): ProjectEntry[] {
  const target = resolve(path);
  const list = loadProjects().filter((p) => resolve(p.path) !== target);
  writeJson(PROJECTS_PATH, list);
  return list;
}

export function loadQuickActions(): QuickAction[] {
  const seed: QuickAction[] = [
    { label: 'Explain project', text: 'Explain what this project does and how it is structured.' },
    { label: 'Code review', text: '/code-review' },
    { label: 'Git status', text: 'Show me the git status and summarize uncommitted changes.' },
  ];
  const existing = readJson<QuickAction[] | null>(QUICKACTIONS_PATH, null);
  if (existing && Array.isArray(existing) && existing.length) return existing;
  writeJson(QUICKACTIONS_PATH, seed);
  return seed;
}
