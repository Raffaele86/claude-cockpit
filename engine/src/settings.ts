// Lettura/scrittura delle impostazioni engine (file JSON in COCKPIT_DIR).
// I segreti escono mascherati; un valore mascherato in ingresso significa "lascia quello che c'è".
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COCKPIT_DIR } from './auth.js';
import { loadQuickActions, readJson, writeJson } from './projects.js';
import type { CockpitSettings } from './protocol.js';

const TELEGRAM_PATH = join(COCKPIT_DIR, 'telegram.json');
const PROVIDERS_PATH = join(COCKPIT_DIR, 'providers.json');
const ENGINE_PATH = join(COCKPIT_DIR, 'engine.json');
const QUICKACTIONS_PATH = join(COCKPIT_DIR, 'quickactions.json');

const MASK_PREFIX = '••••';

function mask(secret: string | undefined): string | undefined {
  if (!secret) return undefined;
  return MASK_PREFIX + secret.slice(-4);
}

const isMasked = (v: unknown): boolean => typeof v === 'string' && v.startsWith(MASK_PREFIX);

type TelegramFile = CockpitSettings['telegram'];
type ProvidersFile = CockpitSettings['providers'];

export function readSettings(): CockpitSettings {
  const tg = readJson<TelegramFile>(TELEGRAM_PATH, {});
  const providers = readJson<ProvidersFile>(PROVIDERS_PATH, {});
  const engine = readJson<{ hosts?: string[]; host?: string; defaultPermissionMode?: CockpitSettings['engine']['defaultPermissionMode']; autoCheckpoint?: boolean }>(ENGINE_PATH, {});
  return {
    telegram: { ...tg, botToken: mask(tg.botToken), sttApiKey: mask(tg.sttApiKey) },
    providers,
    engine: {
      hosts: engine.hosts ?? (engine.host ? [engine.host] : ['127.0.0.1']),
      defaultPermissionMode: engine.defaultPermissionMode ?? 'default',
      autoCheckpoint: engine.autoCheckpoint ?? false,
    },
    quickactions: loadQuickActions(),
  };
}

/** Applica la patch sui file. Ritorna quali sezioni sono cambiate (per hot-reload/restart hint). */
export function applySettings(patch: Partial<CockpitSettings>): { telegram: boolean; engine: boolean; quickactions: boolean } {
  const changed = { telegram: false, engine: false, quickactions: false };

  if (patch.telegram) {
    const cur = readJson<TelegramFile>(TELEGRAM_PATH, {});
    const p = patch.telegram;
    const next: TelegramFile = {
      botToken: isMasked(p.botToken) ? cur.botToken : p.botToken?.trim() || undefined,
      chatId: p.chatId || undefined,
      project: p.project?.trim() || undefined,
      sttApiKey: isMasked(p.sttApiKey) ? cur.sttApiKey : p.sttApiKey?.trim() || undefined,
      sttProvider: p.sttProvider,
      sttLanguage: p.sttLanguage?.trim() || undefined,
    };
    // Contiene segreti: mode 0600 come il token.
    writeFileSync(TELEGRAM_PATH, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
    changed.telegram = true;
  }

  if (patch.providers) {
    const next: ProvidersFile = {};
    for (const [name, p] of Object.entries(patch.providers)) {
      if (!name.trim() || name.trim() === 'claude' || !p?.configDir?.trim()) continue;
      const models = (p.models ?? []).map((m) => m.trim()).filter(Boolean);
      next[name.trim()] = {
        configDir: p.configDir.trim(),
        model: p.model?.trim() || undefined,
        models: models.length ? models : undefined,
        modelsUrl: p.modelsUrl?.trim() || undefined,
        modelPrefix: p.modelPrefix?.trim() || undefined,
      };
    }
    writeJson(PROVIDERS_PATH, next);
  }

  if (patch.engine) {
    const hosts = (patch.engine.hosts ?? []).map((h) => h.trim()).filter(Boolean);
    writeJson(ENGINE_PATH, {
      hosts: hosts.length ? hosts : ['127.0.0.1'],
      ...(patch.engine.defaultPermissionMode && patch.engine.defaultPermissionMode !== 'default'
        ? { defaultPermissionMode: patch.engine.defaultPermissionMode }
        : {}),
      ...(patch.engine.autoCheckpoint ? { autoCheckpoint: true } : {}),
    });
    changed.engine = true;
  }

  if (patch.quickactions) {
    const list = patch.quickactions.filter((q) => q.label?.trim() && q.text?.trim());
    writeJson(QUICKACTIONS_PATH, list);
    changed.quickactions = true;
  }

  return changed;
}

/** true se gli hosts su file differiscono da quelli su cui l'engine è in ascolto. */
export function hostsChanged(activeHosts: string[]): boolean {
  if (!existsSync(ENGINE_PATH)) return false;
  try {
    const cfg = JSON.parse(readFileSync(ENGINE_PATH, 'utf8')) as { hosts?: string[] };
    const onFile = cfg.hosts?.length ? cfg.hosts : ['127.0.0.1'];
    return JSON.stringify([...onFile].sort()) !== JSON.stringify([...activeHosts].sort());
  } catch {
    return false;
  }
}
