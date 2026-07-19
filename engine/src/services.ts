// Health-check dei servizi locali del Cockpit. Config in ~/.claude-cockpit/services.json
// (shape { "services": [{"name","url"}] }); file assente/invalido = nessun servizio (feature spenta).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COCKPIT_DIR } from './auth.js';
import type { ServiceStatus } from './protocol.js';

const TIMEOUT_MS = 3_000;

interface ServiceEntry {
  name: string;
  url: string;
}

function loadServices(): ServiceEntry[] {
  try {
    const cfg = JSON.parse(readFileSync(join(COCKPIT_DIR, 'services.json'), 'utf8')) as { services?: ServiceEntry[] };
    return Array.isArray(cfg.services) ? cfg.services : [];
  } catch {
    return [];
  }
}

async function checkOne(entry: ServiceEntry): Promise<ServiceStatus> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(entry.url, { signal: controller.signal });
    return { name: entry.name, url: entry.url, ok: res.status < 500, code: res.status, ms: Date.now() - start };
  } catch (err) {
    return { name: entry.name, url: entry.url, ok: false, error: String(err instanceof Error ? err.message : err) };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkServices(): Promise<ServiceStatus[]> {
  const services = loadServices();
  return Promise.all(services.map(checkOne));
}
