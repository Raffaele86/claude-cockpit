import { join } from 'node:path';
import { COCKPIT_DIR } from './auth.js';
import { readJson, writeJson } from './projects.js';

const STORE_PATH = join(COCKPIT_DIR, 'sessions.json');

/** Mappa persistente projectPath → ultimo session_id, per il resume dopo restart. */
function load(): Record<string, string> {
  return readJson<Record<string, string>>(STORE_PATH, {});
}

export function getStoredSession(project: string): string | undefined {
  return load()[project];
}

export function setStoredSession(project: string, sessionId: string): void {
  const map = load();
  if (map[project] === sessionId) return;
  map[project] = sessionId;
  writeJson(STORE_PATH, map);
}

export function clearStoredSession(project: string): void {
  const map = load();
  if (!(project in map)) return;
  delete map[project];
  writeJson(STORE_PATH, map);
}
