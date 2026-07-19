import { join } from 'node:path';
import { COCKPIT_DIR } from './auth.js';
import { readJson, writeJson } from './projects.js';

/** Record persistente di un pty claude: sessionId assegnato allo spawn + store/modello con cui
 *  è partito. Sopravvive al restart dell'engine (update in mezzo a una sessione): al prossimo
 *  attach della STESSA scheda la conversazione riparte con `--resume <sessionId>` — deterministico,
 *  mai euristiche (nella cwd girano anche scheduler/Telegram/CLI esterni). */
export interface PtyRecord {
  sessionId: string;
  configDir?: string;
  model?: string;
}

const STORE_PATH = join(COCKPIT_DIR, 'pty-sessions.json');

function load(): Record<string, PtyRecord> {
  return readJson<Record<string, PtyRecord>>(STORE_PATH, {});
}

export function getPtyRecord(mapKey: string): PtyRecord | undefined {
  return load()[mapKey];
}

export function setPtyRecord(mapKey: string, rec: PtyRecord): void {
  const map = load();
  const cur = map[mapKey];
  if (cur && cur.sessionId === rec.sessionId && cur.configDir === rec.configDir && cur.model === rec.model) return;
  map[mapKey] = rec;
  writeJson(STORE_PATH, map);
}

export function clearPtyRecord(mapKey: string): void {
  const map = load();
  if (!(mapKey in map)) return;
  delete map[mapKey];
  writeJson(STORE_PATH, map);
}
