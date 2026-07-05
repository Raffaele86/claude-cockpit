import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const COCKPIT_DIR = join(homedir(), '.claude-cockpit');
export const TOKEN_PATH = join(COCKPIT_DIR, 'token');

export function loadOrCreateToken(): string {
  mkdirSync(COCKPIT_DIR, { recursive: true, mode: 0o700 });
  if (!existsSync(TOKEN_PATH)) {
    writeFileSync(TOKEN_PATH, randomBytes(32).toString('hex') + '\n', { mode: 0o600 });
  }
  return readFileSync(TOKEN_PATH, 'utf8').trim();
}

export function tokenMatches(expected: string, provided: unknown): boolean {
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
