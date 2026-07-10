import { homedir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { createServer } from 'node:http';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmdirSync, statSync, unlinkSync } from 'node:fs';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { getSessionMessages, listSessions, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { COCKPIT_DIR, loadOrCreateToken, tokenMatches, TOKEN_PATH } from './auth.js';
import { CockpitSession } from './session.js';
import { loadProjects, loadQuickActions, removeProject, upsertProject } from './projects.js';
import { clearStoredSession, getStoredSession, setStoredSession } from './sessions-store.js';
import { PtyChannel } from './pty.js';
import type { ClientMsg, PermissionModeName, ServerMsg, SessionCategory } from './protocol.js';
import { randomUUID } from 'node:crypto';
import { startTelegramGateway, type TelegramGateway } from './telegram.js';
import { applySettings, hostsChanged, readSettings } from './settings.js';
import { transcribeAudio } from './stt.js';
import { logUsage, usageReport } from './usage.js';

const ENGINE_VERSION = '0.23.0';
const PORT = Number(process.env.COCKPIT_PORT) || 8130; // override: solo per gli smoke (istanza isolata)
const AUTH_TIMEOUT_MS = 10_000;
const HISTORY_CAP = 200; // ultimi N messaggi: evita payload WS enormi su sessioni lunghe

// engine.json opzionale: { "hosts": ["127.0.0.1", "<ip-vpn>"] } — un listener per host.
// Default solo localhost; aggiungere l'IP Tailscale abilita l'accesso dal telefono (browser).
function loadEngineHosts(): string[] {
  try {
    const raw = readFileSync(join(COCKPIT_DIR, 'engine.json'), 'utf8');
    const cfg = JSON.parse(raw) as { hosts?: string[]; host?: string };
    const hosts = cfg.hosts ?? (cfg.host ? [cfg.host] : []);
    return hosts.length > 0 ? hosts : ['127.0.0.1'];
  } catch {
    return ['127.0.0.1'];
  }
}
const HOSTS = loadEngineHosts();

// engine.json: modalità permessi di partenza delle sessioni (es. bypassPermissions); riletta a ogni sessione.
function loadDefaultPermissionMode(): PermissionModeName {
  try {
    const cfg = JSON.parse(readFileSync(join(COCKPIT_DIR, 'engine.json'), 'utf8')) as { defaultPermissionMode?: PermissionModeName };
    return cfg.defaultPermissionMode ?? 'default';
  } catch {
    return 'default';
  }
}

const token = loadOrCreateToken();
const sessions = new Map<string, CockpitSession>();
const ptys = new Map<string, PtyChannel>();
const ptyByKey = new Map<string, string>(); // "<chiave-canale>::<cmd>" → ptyId (pty persistenti, re-attach)
const authed = new Set<WebSocket>();
const busy = new Map<string, boolean>(); // project → turno in corso (per /status del gateway)

// Attività CLI: una scheda è "attiva" se un suo pty ha prodotto output negli ultimi 3s (euristica).
// Transizioni broadcastate come pty_activity; lo spegnimento lo fa un unico tick da 2s.
const PTY_IDLE_MS = 3_000;
const cliActive = new Map<string, boolean>(); // chiave canale → attivo
function setCliActive(key: string, active: boolean): void {
  if ((cliActive.get(key) ?? false) === active) return;
  cliActive.set(key, active);
  broadcast({ ev: 'pty_activity', project: key, active });
}
setInterval(() => {
  for (const [key, active] of cliActive) {
    if (!active) continue;
    let latest = 0;
    for (const cmd of ['claude', 'shell']) {
      const ch = ptys.get(ptyByKey.get(`${key}::${cmd}`) ?? '');
      if (ch) latest = Math.max(latest, ch.lastDataAt);
    }
    if (Date.now() - latest > PTY_IDLE_MS) setCliActive(key, false);
  }
}, 2_000).unref();
const providerByProject = new Map<string, import('./protocol.js').ProviderName>(); // default 'claude'

// providers.json opzionale: { "<nome>": { "configDir": "...", "model": "...", "models": [...] } }
function loadProviders(): Record<string, { configDir: string; model?: string; models?: string[]; modelsUrl?: string; modelPrefix?: string }> {
  try {
    const cfg = JSON.parse(readFileSync(join(COCKPIT_DIR, 'providers.json'), 'utf8')) as Record<
      string,
      { configDir: string; model?: string; models?: string[]; modelsUrl?: string; modelPrefix?: string }
    >;
    return Object.fromEntries(Object.entries(cfg).filter(([, v]) => v?.configDir));
  } catch {
    return {};
  }
}

// Catalogo modelli live di un provider (per il selettore con ricerca). Se `modelsUrl` è
// impostato (endpoint stile OpenRouter: { data: [{ id, name, pricing }] }) lo interroga e
// antepone `modelPrefix` agli id; i modelli free (id `:free` o prompt price 0) vanno in cima.
// Cache 5 min per non martellare l'endpoint a ogni selezione del provider.
const catalogCache = new Map<string, { at: number; models: import('./protocol.js').CatalogModel[] }>();
async function providerCatalog(name: string): Promise<import('./protocol.js').CatalogModel[]> {
  const cfg = loadProviders()[name];
  if (!cfg) return [];
  const prefix = cfg.modelPrefix ?? '';
  if (!cfg.modelsUrl) {
    // Nessun catalogo live: usa la lista statica (già coi prefissi in providers.json).
    return (cfg.models ?? (cfg.model ? [cfg.model] : [])).map((id) => ({ id, free: id.endsWith(':free'), label: id }));
  }
  const cached = catalogCache.get(name);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.models;
  try {
    const res = await fetch(cfg.modelsUrl, { signal: AbortSignal.timeout(15_000) });
    const json = (await res.json()) as { data?: { id: string; name?: string; pricing?: { prompt?: string } }[] };
    const rows = json.data ?? [];
    const models: import('./protocol.js').CatalogModel[] = rows.map((m) => {
      const free = m.id.endsWith(':free') || m.pricing?.prompt === '0';
      return { id: prefix + m.id, free, label: m.name ? `${m.name} · ${m.id}` : m.id };
    });
    // Free in cima, poi alfabetico.
    models.sort((a, b) => (a.free === b.free ? a.id.localeCompare(b.id) : a.free ? -1 : 1));
    catalogCache.set(name, { at: Date.now(), models });
    return models;
  } catch (err) {
    console.error('[engine] provider_catalog', name, String(err));
    return (cfg.models ?? []).map((id) => ({ id, free: id.endsWith(':free'), label: id }));
  }
}

function loadProviderConfig(name: string): { configDir: string; model?: string } | null {
  try {
    const cfg = JSON.parse(readFileSync(join(COCKPIT_DIR, 'providers.json'), 'utf8')) as Record<
      string,
      { configDir: string; model?: string }
    >;
    return cfg[name]?.configDir ? cfg[name] : null;
  } catch {
    return null;
  }
}
const eventListeners = new Set<(msg: ServerMsg) => void>(); // es. gateway Telegram
const permMeta = new Map<string, { project: string; toolName: string }>(); // requestId → per l'auto-uscita dal plan mode

// UI statica (build vite copiata in engine/ui): stessa porta del WS → usabile da browser.
const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'ui');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const handleHttp = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
  const path = normalize((req.url ?? '/').split('?')[0]).replaceAll('\\', '/');
  const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
  const file = join(UI_DIR, rel);
  if (!file.startsWith(UI_DIR) || !existsSync(file)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
};

const wss = new WebSocketServer({ noServer: true });

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg: ServerMsg): void {
  for (const ws of authed) send(ws, msg);
  for (const fn of eventListeners) {
    try {
      fn(msg);
    } catch (err) {
      console.error('[engine] event listener:', String(err));
    }
  }
  if ('project' in msg && msg.project) {
    if (msg.ev === 'result' || msg.ev === 'session_closed') busy.set(msg.project, false);
  }
}

/** Traduce i messaggi SDK negli eventi WS del protocollo Cockpit. */
function forwardSdkMessage(project: string, msg: SDKMessage): void {
  switch (msg.type) {
    case 'system':
      if (msg.subtype === 'init') {
        setStoredSession(project, msg.session_id); // per il resume dopo restart
        broadcast({
          ev: 'init',
          project,
          session_id: msg.session_id,
          model: msg.model,
          permissionMode: msg.permissionMode,
          tools: msg.tools,
          slash_commands: msg.slash_commands,
        });
        void emitContext(project);
      }
      break;
    case 'stream_event':
      broadcast({ ev: 'stream', project, event: msg.event });
      break;
    case 'assistant':
      broadcast({ ev: 'assistant', project, message: msg.message });
      break;
    case 'user':
      broadcast({ ev: 'tool_result', project, message: msg.message });
      break;
    case 'result': {
      broadcast({
        ev: 'result',
        project,
        subtype: msg.subtype,
        is_error: msg.is_error,
        cost_usd: msg.total_cost_usd,
        usage: msg.usage,
        num_turns: msg.num_turns,
        result: msg.subtype === 'success' ? msg.result : undefined,
      });
      const u = (msg.usage ?? {}) as Record<string, number>;
      logUsage({
        ts: new Date().toISOString(),
        project: cwdOf(project).replace(/[/.]/g, '-'),
        provider: providerByProject.get(project) ?? 'claude',
        costUsd: msg.total_cost_usd || 0,
        inTok: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
        outTok: u.output_tokens || 0,
      });
      void emitContext(project);
      break;
    }
    default:
      // Altri tipi (status, hook, task, ...) non servono alla UI per ora.
      break;
  }
}

/** Errore atteso quando una richiesta era in volo su una sessione chiusa di proposito
 *  (chiusura scheda / reset): non è un problema da mostrare all'utente. */
function isBenignClosed(err: unknown): boolean {
  return String(err).includes('Query closed before response received');
}

/** Branch git corrente di una dir (da .git/HEAD, senza spawnare git). */
function gitBranch(cwd: string): string | undefined {
  try {
    const head = readFileSync(join(cwd, '.git', 'HEAD'), 'utf8').trim();
    return head.startsWith('ref: refs/heads/') ? head.slice(16) : head.slice(0, 8);
  } catch {
    return undefined;
  }
}

/** Uso contesto reale dall'SDK (stesso dato del CLI) → ev 'context' con anche il branch git. */
async function emitContext(project: string): Promise<void> {
  const session = sessions.get(project);
  if (!session) return;
  try {
    const u = await session.contextUsage();
    broadcast({ ev: 'context', project, ...u, branch: gitBranch(cwdOf(project)) });
  } catch {
    /* sessione appena chiusa o SDK vecchio: nessun dato ctx */
  }
}

/**
 * Categoria di una sessione dall'entrypoint nella testa del suo .jsonl
 * (sdk-ts=Cockpit, cli=terminale, sdk-cli=headless→scheduler se il primo prompt ha il pattern dei task).
 */
function sessionCategory(project: string, sessionId: string, firstPrompt?: string): SessionCategory {
  const slug = cwdOf(project).replace(/[/.]/g, '-');
  const file = join(homedir(), '.claude', 'projects', slug, `${sessionId}.jsonl`);
  let head = '';
  try {
    const fd = openSync(file, 'r');
    const buf = Buffer.alloc(4096);
    const n = readSync(fd, buf, 0, buf.length, 0);
    closeSync(fd);
    head = buf.subarray(0, n).toString('utf8');
  } catch {
    return 'tech';
  }
  const ep = /"entrypoint"\s*:\s*"([a-z-]+)"/.exec(head)?.[1];
  if (ep === 'sdk-ts') return 'cockpit';
  if (ep === 'cli') return 'cli';
  if (/\[Modalita' headless scheduler/i.test(firstPrompt ?? '') || /\[Modalita' headless scheduler/i.test(head))
    return 'scheduler';
  return 'tech';
}

/** Estrae il testo user/assistant da una riga jsonl di sessione. */
function lineText(line: string): string {
  try {
    const d = JSON.parse(line) as { type?: string; message?: { content?: unknown } };
    if (d.type !== 'user' && d.type !== 'assistant') return '';
    const c = d.message?.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c))
      return c
        .map((b) => (b && typeof b === 'object' && 'text' in b ? String((b as { text: unknown }).text ?? '') : ''))
        .join(' ');
  } catch {
    /* riga non-JSON o schema diverso */
  }
  return '';
}

/** Ricerca full-text nel contenuto delle sessioni del progetto (case-insensitive, max 20 risultati). */
async function searchSessions(project: string, query: string): Promise<import('./protocol.js').SearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const slug = cwdOf(project).replace(/[/.]/g, '-');
  const list = await listSessions({ dir: cwdOf(project), limit: 100 });
  const results: import('./protocol.js').SearchResult[] = [];
  for (const s of list) {
    if (results.length >= 20) break;
    const file = join(homedir(), '.claude', 'projects', slug, `${s.sessionId}.jsonl`);
    let raw: string;
    try {
      raw = readFileSync(file, 'utf8');
      if (raw.length > 2_000_000) raw = raw.slice(0, 2_000_000); // cap: sessioni enormi
    } catch {
      continue;
    }
    let snippet = '';
    for (const line of raw.split('\n')) {
      const text = lineText(line);
      const idx = text.toLowerCase().indexOf(q);
      if (idx >= 0) {
        snippet = text.slice(Math.max(0, idx - 80), idx + q.length + 80).replace(/\s+/g, ' ').trim();
        break;
      }
    }
    if (!snippet) continue;
    results.push({
      sessionId: s.sessionId,
      summary: s.customTitle || s.summary || s.firstPrompt || '(senza titolo)',
      lastModified: s.lastModified,
      category: sessionCategory(project, s.sessionId, s.firstPrompt),
      snippet,
    });
  }
  return results;
}

/**
 * Chiave canale canonica. Multi-istanza: "<path>##<tab>" = scheda extra sullo stesso progetto
 * (tab main = path puro). Il suffisso resta nella chiave (Map sessioni, store, broadcast);
 * il cwd reale per SDK/filesystem si ottiene con cwdOf().
 */
function normalizeProject(projectPath: string | undefined): string {
  const raw = projectPath || homedir();
  const hash = raw.indexOf('##');
  if (hash === -1) return resolve(raw);
  return resolve(raw.slice(0, hash) || homedir()) + raw.slice(hash);
}

/** Path filesystem reale di una chiave canale (toglie l'eventuale suffisso ##tab). */
function cwdOf(key: string): string {
  const hash = key.indexOf('##');
  return hash === -1 ? key : key.slice(0, hash);
}

// ---- checkpoint file di progetto (tar.gz in ~/.claude-cockpit/checkpoints/<slug>/) ----
const CHECKPOINT_KEEP = 5; // retention per progetto (i pre-restore non potano, ma contano al create successivo)
const CHECKPOINT_EXCLUDES = ['node_modules', '.git', 'dist', 'dist-win', 'build', '__pycache__', '.venv'];

function checkpointDir(cwd: string): string {
  return join(COCKPIT_DIR, 'checkpoints', cwd.replace(/[/.]/g, '-'));
}

function checkpointList(cwd: string): { file: string; ts: number; label: string; size: number }[] {
  const dir = checkpointDir(cwd);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.tar.gz'))
    .sort()
    .reverse()
    .map((f) => {
      const m = f.match(/^(\d+)(?:-(.*))?\.tar\.gz$/);
      return { file: f, ts: m ? Number(m[1]) : 0, label: m?.[2] ?? '', size: statSync(join(dir, f)).size };
    });
}

function execP(cmd: string, args: string[]): Promise<void> {
  return new Promise((res, rej) => execFile(cmd, args, (err, _out, stderr) => (err ? rej(new Error(stderr || String(err))) : res())));
}

async function checkpointCreate(cwd: string, label: string, prune: boolean): Promise<void> {
  if (resolve(cwd) === homedir()) throw new Error('checkpoint sulla home non supportato: apri un progetto');
  const dir = checkpointDir(cwd);
  mkdirSync(dir, { recursive: true });
  const safe = label.trim().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const file = `${Date.now()}${safe ? '-' + safe : ''}.tar.gz`;
  await execP('tar', ['-czf', join(dir, file), ...CHECKPOINT_EXCLUDES.flatMap((e) => ['--exclude', e]), '-C', cwd, '.']);
  if (prune) {
    const all = readdirSync(dir).filter((f) => f.endsWith('.tar.gz')).sort();
    for (const old of all.slice(0, Math.max(0, all.length - CHECKPOINT_KEEP))) unlinkSync(join(dir, old));
  }
}

function getOrCreateSession(projectPath: string, model?: string): CockpitSession {
  const project = normalizeProject(projectPath);
  let session = sessions.get(project);
  if (!session) {
    const resume = getStoredSession(project);
    const permissionMode = loadDefaultPermissionMode();
    // Provider alternativo (GLM): config dir dedicata via env; il model del provider vince sul default.
    let env: Record<string, string | undefined> | undefined;
    const provider = providerByProject.get(project) ?? 'claude';
    if (provider !== 'claude') {
      const cfg = loadProviderConfig(provider);
      if (cfg) {
        env = { ...process.env, CLAUDE_CONFIG_DIR: cfg.configDir };
        model = model ?? cfg.model;
      }
    }
    let created: CockpitSession;
    created = new CockpitSession(
      cwdOf(project),
      {
        message: (msg) => forwardSdkMessage(project, msg),
        permissionRequest: (req) => {
          permMeta.set(req.requestId, { project, toolName: req.toolName });
          broadcast({ ev: 'permission_request', project, ...req });
        },
        permissionResolved: (requestId) => {
          permMeta.delete(requestId);
          broadcast({ ev: 'permission_resolved', project, requestId });
        },
        closed: (error) => {
          // Solo se in mappa c'è ANCORA questa sessione: una closed() tardiva (es. dopo reset+prompt
          // rapidi) non deve sganciare la sessione nuova già creata al suo posto.
          if (sessions.get(project) !== created) return;
          sessions.delete(project);
          // Resume fallito (session_id obsoleto): mai lasciare il progetto bloccato.
          if (error && created.usedResume && created.sessionId === null) {
            clearStoredSession(project);
            broadcast({ ev: 'session_closed', project });
            broadcast({
              ev: 'error',
              project,
              message: 'Ripristino sessione fallito (id obsoleto): ripartita da zero, reinvia l’ultimo messaggio.',
            });
            return;
          }
          broadcast({ ev: 'session_closed', project });
          if (error) broadcast({ ev: 'error', project, message: String(error) });
        },
      },
      { model, resume, env, permissionMode },
    );
    session = created;
    sessions.set(project, session);
    console.log(`[engine] sessione creata per ${project}${resume ? ` (resume ${resume.slice(0, 8)})` : ''}`);
  }
  return session;
}

// engine.json: checkpoint automatico pre-prompt (riletto a ogni prompt, come il default mode).
function autoCheckpointEnabled(): boolean {
  try {
    const cfg = JSON.parse(readFileSync(join(COCKPIT_DIR, 'engine.json'), 'utf8')) as { autoCheckpoint?: boolean };
    return cfg.autoCheckpoint === true;
  } catch {
    return false;
  }
}

const AUTO_CHECKPOINT_DEBOUNCE_MS = 10 * 60_000;
const lastAutoCheckpoint = new Map<string, number>(); // cwd → epoch ms ultimo snapshot auto

/** Riusabili anche dal gateway Telegram. */
function promptProject(projectPath: string, text: string, images?: import('./protocol.js').PromptImage[], model?: string): void {
  const project = normalizeProject(projectPath);
  if (autoCheckpointEnabled()) {
    const cwd = cwdOf(project);
    const last = lastAutoCheckpoint.get(cwd) ?? 0;
    if (Date.now() - last > AUTO_CHECKPOINT_DEBOUNCE_MS) {
      lastAutoCheckpoint.set(cwd, Date.now());
      // Fire-and-forget: non ritardare il prompt; la home viene rifiutata da checkpointCreate.
      void checkpointCreate(cwd, 'auto', true).catch(() => {});
    }
  }
  busy.set(project, true);
  getOrCreateSession(project, model).prompt(text, images);
}

function resetProject(projectPath: string): void {
  const project = normalizeProject(projectPath);
  const session = sessions.get(project);
  if (session) {
    sessions.delete(project); // prima del close: il closed() non deve ri-broadcastare errori
    session.close();
  }
  clearStoredSession(project);
  broadcast({ ev: 'session_reset', project });
}

function decidePermissionAny(
  requestId: string,
  decision: import('./protocol.js').PermissionDecision,
  updatedInput?: Record<string, unknown>,
): boolean {
  // Da leggere PRIMA della decisione: finishPermission emette permissionResolved che svuota permMeta.
  const meta = permMeta.get(requestId);
  for (const session of sessions.values()) {
    if (session.decidePermission(requestId, decision, updatedInput)) {
      // Fine plan mode: al via libera su ExitPlanMode la sessione torna alla modalità di default
      // (per l'utente tipicamente bypassPermissions) invece di restare in plan.
      if (meta && decision !== 'deny' && meta.toolName === 'ExitPlanMode') {
        const mode = loadDefaultPermissionMode();
        void session.setPermissionMode(mode as never).then(() => broadcast({ ev: 'permission_mode', project: meta.project, mode }));
      }
      return true;
    }
  }
  permMeta.delete(requestId);
  return false;
}

/** Esegue `claude mcp ...` nel cwd del progetto (scope project → scrive .mcp.json lì). */
function runClaudeCli(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('claude', args, { cwd, timeout: 30_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || stdout.trim() || String(err)));
      else resolve(stdout);
    });
  });
}

// N.B. il CLI vuole i positional PRIMA delle opzioni; per stdio le opzioni prima di `--`.
function mcpAddArgs(server: import('./protocol.js').McpAddRequest): string[] {
  const scope = ['-s', server.scope === 'project' ? 'project' : 'user'];
  if (server.transport === 'stdio') {
    const env = (server.env ?? []).filter((e) => e.trim()).flatMap((e) => ['-e', e.trim()]);
    return ['mcp', 'add', server.name, ...scope, ...env, '--', ...server.target.trim().split(/\s+/)];
  }
  const headers = (server.headers ?? []).filter((h) => h.trim()).flatMap((h) => ['--header', h.trim()]);
  return ['mcp', 'add', server.name, server.target.trim(), ...scope, '--transport', server.transport, ...headers];
}

/** Chiude la sessione viva senza toccare lo stored id: il prossimo prompt riparte in resume
 *  ricaricando la config (stesso pattern di set_provider) — serve dopo mcp add/remove. */
function restartSessionKeepingConversation(project: string): void {
  const session = sessions.get(project);
  if (session) {
    sessions.delete(project);
    session.close();
  }
}

async function handleMcpOp(ws: WebSocket, projectPath: string, name: string, args: string[]): Promise<void> {
  const project = normalizeProject(projectPath);
  try {
    await runClaudeCli(args, cwdOf(project));
    restartSessionKeepingConversation(project);
    broadcast({ ev: 'mcp_op_done', project, name });
    const servers = await getOrCreateSession(project).mcpStatus();
    send(ws, { ev: 'mcp_status', project, servers });
  } catch (err) {
    send(ws, { ev: 'mcp_op_done', project, name, error: String(err instanceof Error ? err.message : err) });
  }
}

function sendSettings(ws: WebSocket): void {
  send(ws, {
    ev: 'settings',
    data: readSettings(),
    restartRequired: hostsChanged(HOSTS),
    telegramActive: telegram !== null,
  });
}

async function handleMessage(ws: WebSocket, msg: ClientMsg): Promise<void> {
  switch (msg.op) {
    case 'prompt': {
      promptProject(msg.project, msg.text, msg.images, msg.model);
      break;
    }
    case 'session_reset': {
      resetProject(msg.project);
      break;
    }
    case 'sessions_list': {
      const project = normalizeProject(msg.project);
      try {
        const list = await listSessions({ dir: cwdOf(project), limit: 100 });
        send(ws, {
          ev: 'sessions',
          project,
          sessions: list.map((s) => ({
            sessionId: s.sessionId,
            summary: s.customTitle || s.summary || s.firstPrompt || '(senza titolo)',
            lastModified: s.lastModified,
            category: sessionCategory(project, s.sessionId, s.firstPrompt),
          })),
        });
      } catch (err) {
        send(ws, { ev: 'error', message: `sessions_list: ${String(err)}` });
      }
      break;
    }
    case 'sessions_search': {
      const project = normalizeProject(msg.project);
      try {
        const results = await searchSessions(project, msg.query);
        send(ws, { ev: 'sessions_search', project, query: msg.query, results });
      } catch (err) {
        send(ws, { ev: 'error', message: `sessions_search: ${String(err)}` });
      }
      break;
    }
    case 'session_open': {
      const project = normalizeProject(msg.project);
      const session = sessions.get(project);
      if (session) {
        sessions.delete(project);
        session.close();
      }
      setStoredSession(project, msg.sessionId); // il prossimo prompt riparte con resume=questo id
      broadcast({ ev: 'session_opened', project, sessionId: msg.sessionId });
      break;
    }
    case 'open_project': {
      // Warm della sessione: fa partire il processo claude → init + slash_commands.
      getOrCreateSession(msg.project);
      break;
    }
    case 'set_model': {
      const session = getOrCreateSession(msg.project);
      void session.setModel(msg.model);
      break;
    }
    case 'set_effort': {
      const session = getOrCreateSession(msg.project);
      session.setEffort(msg.effort).catch((err) => send(ws, { ev: 'error', message: `set_effort: ${String(err)}` }));
      break;
    }
    case 'models_list': {
      const session = getOrCreateSession(msg.project);
      try {
        const models = await session.models();
        send(ws, { ev: 'models', project: normalizeProject(msg.project), models });
      } catch (err) {
        // Sessione chiusa mentre la richiesta era in volo (es. scheda chiusa subito dopo
        // l'apertura): esito atteso, nessun banner d'errore.
        if (!isBenignClosed(err)) send(ws, { ev: 'error', message: `models_list: ${String(err)}` });
      }
      break;
    }
    case 'projects_list':
      send(ws, { ev: 'projects', list: loadProjects() });
      break;
    case 'projects_upsert':
      broadcast({ ev: 'projects', list: upsertProject(msg.project) });
      break;
    case 'projects_remove':
      broadcast({ ev: 'projects', list: removeProject(msg.path) });
      break;
    case 'quickactions_list':
      send(ws, { ev: 'quickactions', list: loadQuickActions() });
      break;
    case 'history': {
      const project = normalizeProject(msg.project);
      const sid = sessions.get(project)?.sessionId ?? getStoredSession(project);
      if (!sid) {
        send(ws, { ev: 'history', project, messages: [] });
        break;
      }
      try {
        const raw = await getSessionMessages(sid, { dir: cwdOf(project) });
        const capped = raw.slice(-HISTORY_CAP);
        send(ws, { ev: 'history', project, messages: capped.map((m) => ({ type: m.type, message: m.message })) });
      } catch {
        send(ws, { ev: 'history', project, messages: [] }); // non bloccare la UI se manca lo storico
      }
      break;
    }
    case 'mcp_status': {
      const session = getOrCreateSession(msg.project);
      try {
        const servers = await session.mcpStatus();
        send(ws, { ev: 'mcp_status', project: normalizeProject(msg.project), servers });
      } catch (err) {
        if (!isBenignClosed(err)) send(ws, { ev: 'error', message: `mcp_status: ${String(err)}` });
      }
      break;
    }
    case 'dir_list': {
      const path = msg.path.startsWith('~') ? join(homedir(), msg.path.slice(1)) : resolve(msg.path);
      try {
        const registry = new Set(loadProjects().map((p) => resolve(p.path)));
        const entries = readdirSync(path, { withFileTypes: true })
          .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
          .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1))
          .slice(0, 200)
          .map((e) => {
            const full = join(path, e.name);
            const isDir = e.isDirectory();
            const project =
              isDir &&
              (registry.has(full) ||
                existsSync(join(full, '.claude')) ||
                existsSync(join(full, 'CLAUDE.md')) ||
                existsSync(join(full, '.git')));
            return { name: e.name, dir: isDir, project };
          });
        send(ws, { ev: 'dir_entries', path, entries });
      } catch (err) {
        send(ws, { ev: 'error', message: `dir_list: ${String(err)}` });
      }
      break;
    }
    case 'file_op': {
      const path = msg.path.startsWith('~') ? join(homedir(), msg.path.slice(1)) : resolve(msg.path);
      try {
        switch (msg.kind) {
          case 'mkdir': {
            if (!msg.newName?.trim()) throw new Error('nome mancante');
            mkdirSync(join(path, msg.newName.trim()));
            break;
          }
          case 'rename': {
            if (!msg.newName?.trim()) throw new Error('nome mancante');
            const dest = join(dirname(path), msg.newName.trim());
            if (existsSync(dest)) throw new Error(`esiste già: ${dest}`);
            renameSync(path, dest);
            break;
          }
          case 'delete': {
            // Sicurezza: niente cancellazioni ricorsive dalla UI — le fa Claude su richiesta esplicita.
            if (statSync(path).isDirectory()) rmdirSync(path);
            else unlinkSync(path);
            break;
          }
          case 'reveal': {
            const win = execFileSync('wslpath', ['-w', path]).toString().trim();
            spawn('explorer.exe', [statSync(path).isDirectory() ? win : `/select,${win}`], { detached: true, stdio: 'ignore' }).unref();
            break;
          }
        }
        send(ws, { ev: 'file_op_done', kind: msg.kind, path });
      } catch (err) {
        send(ws, { ev: 'file_op_done', kind: msg.kind, path, error: String(err) });
      }
      break;
    }
    case 'settings_get': {
      sendSettings(ws);
      break;
    }
    case 'settings_set': {
      try {
        const changed = applySettings(msg.patch);
        if (changed.telegram) restartTelegram();
        if (changed.quickactions) broadcast({ ev: 'quickactions', list: loadQuickActions() });
        sendSettings(ws);
      } catch (err) {
        send(ws, { ev: 'error', message: `settings_set: ${String(err)}` });
      }
      break;
    }
    case 'stt': {
      if (msg.audio.length > 2_800_000) {
        send(ws, { ev: 'stt_result', error: 'Audio troppo lungo (max ~2MB).' });
        break;
      }
      try {
        const text = await transcribeAudio(msg.audio, msg.mime);
        send(ws, { ev: 'stt_result', text });
      } catch (err) {
        send(ws, { ev: 'stt_result', error: String(err instanceof Error ? err.message : err) });
      }
      break;
    }
    case 'mcp_add': {
      if (!msg.server.name.trim() || !msg.server.target.trim()) {
        send(ws, { ev: 'mcp_op_done', project: normalizeProject(msg.project), name: msg.server.name, error: 'nome o URL/comando mancante' });
        break;
      }
      await handleMcpOp(ws, msg.project, msg.server.name, mcpAddArgs(msg.server));
      break;
    }
    case 'mcp_remove': {
      await handleMcpOp(ws, msg.project, msg.name, ['mcp', 'remove', msg.name]);
      break;
    }
    case 'mcp_export': {
      // Server MCP user-scope: vivono in ~/.claude.json -> file portabile da importare altrove.
      try {
        const cfg = JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf8')) as { mcpServers?: Record<string, unknown> };
        send(ws, { ev: 'mcp_export', servers: cfg.mcpServers ?? {} });
      } catch (err) {
        send(ws, { ev: 'error', message: `mcp_export: ${String(err)}` });
      }
      break;
    }
    case 'mcp_import': {
      const project = normalizeProject(msg.project);
      const added: string[] = [];
      const errors: Record<string, string> = {};
      for (const [name, def] of Object.entries(msg.servers)) {
        try {
          await runClaudeCli(['mcp', 'add-json', name, JSON.stringify(def), '-s', 'user'], cwdOf(project));
          added.push(name);
        } catch (err) {
          errors[name] = String(err instanceof Error ? err.message : err);
        }
      }
      if (added.length) restartSessionKeepingConversation(project); // la sessione rilegge la config
      send(ws, { ev: 'mcp_import_done', added, errors });
      break;
    }
    case 'checkpoint_create': {
      const project = normalizeProject(msg.project);
      const cwd = cwdOf(project);
      try {
        await checkpointCreate(cwd, msg.label ?? '', true);
        send(ws, { ev: 'checkpoint_done', project, action: 'create' });
      } catch (err) {
        send(ws, { ev: 'checkpoint_done', project, action: 'create', error: String(err instanceof Error ? err.message : err) });
      }
      send(ws, { ev: 'checkpoint_list', project, checkpoints: checkpointList(cwd) });
      break;
    }
    case 'checkpoint_list': {
      const project = normalizeProject(msg.project);
      send(ws, { ev: 'checkpoint_list', project, checkpoints: checkpointList(cwdOf(project)) });
      break;
    }
    case 'usage_report': {
      try {
        send(ws, { ev: 'usage_report', days: await usageReport(loadProviders()) });
      } catch (err) {
        send(ws, { ev: 'error', message: `usage_report: ${String(err)}` });
      }
      break;
    }
    case 'checkpoint_restore': {
      const project = normalizeProject(msg.project);
      const cwd = cwdOf(project);
      try {
        const src = join(checkpointDir(cwd), msg.file);
        if (!/^[\w-]+(\.tar\.gz)$/.test(msg.file) || !existsSync(src)) throw new Error('checkpoint inesistente');
        // Rete di sicurezza: snapshot dello stato attuale prima di sovrascrivere (senza retention,
        // così il checkpoint da ripristinare non può venire potato via).
        await checkpointCreate(cwd, 'pre-restore', false);
        await execP('tar', ['-xzf', src, '-C', cwd]);
        send(ws, { ev: 'checkpoint_done', project, action: 'restore' });
      } catch (err) {
        send(ws, { ev: 'checkpoint_done', project, action: 'restore', error: String(err instanceof Error ? err.message : err) });
      }
      send(ws, { ev: 'checkpoint_list', project, checkpoints: checkpointList(cwd) });
      break;
    }
    case 'provider_catalog': {
      const models = await providerCatalog(msg.provider);
      send(ws, { ev: 'provider_catalog', provider: msg.provider, models });
      break;
    }
    case 'set_provider': {
      const project = normalizeProject(msg.project);
      const targetCfg = msg.provider === 'claude' ? { configDir: join(homedir(), '.claude') } : loadProviderConfig(msg.provider);
      if (!targetCfg) {
        send(ws, { ev: 'error', message: `Provider ${msg.provider} non configurato in ~/.claude-cockpit/providers.json` });
        break;
      }
      providerByProject.set(project, msg.provider);
      // Le sessioni vivono nella config dir del provider: copia il transcript nella dir di
      // destinazione, così il resume mantiene la conversazione anche cambiando provider.
      const sid = getStoredSession(project);
      if (sid) {
        const slug = cwdOf(project).replace(/[/.]/g, '-');
        const dirs = [join(homedir(), '.claude'), ...Object.values(loadProviders()).map((c) => c.configDir)];
        const src = dirs.map((d) => join(d, 'projects', slug, `${sid}.jsonl`)).find((p) => existsSync(p));
        const dst = join(targetCfg.configDir, 'projects', slug, `${sid}.jsonl`);
        if (src && src !== dst && !existsSync(dst)) {
          try {
            mkdirSync(dirname(dst), { recursive: true });
            copyFileSync(src, dst);
          } catch (err) {
            console.error('[engine] copia transcript cross-provider fallita:', String(err));
          }
        }
      }
      // Riavvia la sessione col nuovo provider MA senza perdere la conversazione (resume dallo stored id).
      const session = sessions.get(project);
      if (session) {
        sessions.delete(project);
        session.close();
      }
      broadcast({ ev: 'provider', project, provider: msg.provider });
      break;
    }
    case 'file_read': {
      const project = normalizeProject(msg.project);
      const path = msg.path.startsWith('~/') ? join(homedir(), msg.path.slice(2)) : resolve(cwdOf(project), msg.path);
      try {
        let content = readFileSync(path, 'utf8');
        if (content.length > 512_000) content = content.slice(0, 512_000) + '\n\n… (troncato a 512KB)';
        send(ws, { ev: 'file_content', project, path, content });
      } catch (err) {
        send(ws, { ev: 'file_content', project, path, error: String(err) });
      }
      break;
    }
    case 'pty_attach': {
      const key = normalizeProject(msg.project);
      const mapKey = `${key}::${msg.cmd}`;
      let ptyId = ptyByKey.get(mapKey);
      let channel = ptyId ? ptys.get(ptyId) : undefined;
      // launch esplicito = cambio impostazioni (provider/modello/effort/mode); fresh = sessione pulita.
      // In entrambi i casi: via il pty vecchio, il nuovo parte coi flag richiesti.
      let launchOpts: { extraArgs?: string[]; env?: Record<string, string>; sessionId?: string } | undefined;
      if (msg.cmd === 'claude' && (msg.launch || msg.fresh)) {
        const prev = channel; // pty precedente: il SUO sessionId è l'unica conversazione riprendibile
        if (channel && ptyId) {
          ptys.delete(ptyId);
          ptyByKey.delete(mapKey);
          channel.kill();
          ptyId = undefined;
          channel = undefined;
        }
        if (msg.launch) {
          const l = msg.launch;
          const args: string[] = [];
          let env: Record<string, string> | undefined;
          let model = l.model;
          if (l.provider && l.provider !== 'claude') {
            const cfg = loadProviderConfig(l.provider);
            if (cfg) {
              env = { CLAUDE_CONFIG_DIR: cfg.configDir };
              // --model esplicito SEMPRE per glm: il flag CLI batte il `model` delle settings di
              // progetto (`<cwd>/.claude/settings.json` — con cwd=home è il config Claude principale,
              // che inietterebbe un id Claude → API 400 Unknown Model su z.ai).
              model = model ?? cfg.model;
            }
          }
          // Continue DETERMINISTICO: si riprende SOLO il sessionId assegnato al pty precedente
          // (se il suo jsonl esiste = la scheda ha davvero una conversazione). MAI `-c` o euristiche
          // su mtime: nella stessa cwd girano anche scheduler/Telegram/CLI esterni e si aggancerebbe
          // la conversazione di qualcun altro (bug 2026-07-06: due chat sullo stesso jsonl → freeze).
          // Limite accettato: /clear o /resume manuali nel CLI cambiano la sessione reale del pty;
          // il relaunch riprende l'id dello spawn (comunque della scheda giusta, mai di terzi).
          let sessionId: string | undefined;
          if (l.continue && prev?.sessionId) {
            const slug = cwdOf(key).replace(/[/.]/g, '-');
            const srcPath = join(prev.configDir ?? join(homedir(), '.claude'), 'projects', slug, `${prev.sessionId}.jsonl`);
            if (existsSync(srcPath)) {
              const targetDir = env?.CLAUDE_CONFIG_DIR;
              try {
                if ((prev.configDir ?? '') !== (targetDir ?? '')) {
                  // Cambio store (provider): la conversazione segue — copia del jsonl ESATTO.
                  const destDir = join(targetDir ?? join(homedir(), '.claude'), 'projects', slug);
                  mkdirSync(destDir, { recursive: true });
                  copyFileSync(srcPath, join(destDir, `${prev.sessionId}.jsonl`));
                }
                args.push('--resume', prev.sessionId);
                sessionId = prev.sessionId;
              } catch {
                /* copia fallita → parte pulito */
              }
            }
          }
          if (!sessionId) {
            sessionId = randomUUID();
            args.push('--session-id', sessionId);
          }
          if (model) args.push('--model', model);
          if (l.effort) args.push('--effort', l.effort);
          if (l.permissionMode) args.push('--permission-mode', l.permissionMode);
          launchOpts = { extraArgs: args, env, sessionId };
        }
      }
      if (!ptyId || !channel) {
        // Anche l'attach semplice di claude (senza launch) riceve un session-id assegnato:
        // è ciò che rende riprendibile la conversazione della scheda senza indovinare.
        if (msg.cmd === 'claude' && !launchOpts) {
          const sessionId = randomUUID();
          launchOpts = { extraArgs: ['--session-id', sessionId], sessionId };
        }
        // Pty nuovo, persistente: sopravvive al detach (reload/cambio scheda); muore solo
        // a pty_kill o all'uscita del processo.
        const id = randomUUID();
        ptyId = id;
        channel = new PtyChannel(
          cwdOf(key),
          msg.cmd,
          msg.cols,
          msg.rows,
          (data) => {
            broadcast({ ev: 'pty_data', ptyId: id, data });
            setCliActive(key, true);
          },
          (exitCode) => {
            ptys.delete(id);
            if (ptyByKey.get(mapKey) === id) ptyByKey.delete(mapKey);
            broadcast({ ev: 'pty_exit', ptyId: id, exitCode });
            const otherCmd = msg.cmd === 'claude' ? 'shell' : 'claude';
            if (!ptyByKey.has(`${key}::${otherCmd}`)) setCliActive(key, false);
          },
          launchOpts,
        );
        ptys.set(ptyId, channel);
        ptyByKey.set(mapKey, ptyId);
      } else {
        channel.resize(msg.cols, msg.rows);
      }
      send(ws, { ev: 'pty_attach_ok', ptyId, project: key, cmd: msg.cmd, scrollback: channel.scrollback(), sessionId: channel.sessionId });
      break;
    }
    case 'pty_input':
      ptys.get(msg.ptyId)?.write(msg.data);
      break;
    case 'pty_resize':
      ptys.get(msg.ptyId)?.resize(msg.cols, msg.rows);
      break;
    case 'pty_kill': {
      const ch = ptys.get(msg.ptyId);
      if (ch) ch.kill(); // cleanup mappe nel callback onExit
      break;
    }
    case 'pty_kill_project': {
      // Chiusura scheda: via i pty della chiave, così un futuro id di scheda uguale non
      // può ri-attaccarsi alla conversazione di una scheda chiusa.
      const key = normalizeProject(msg.project);
      for (const cmd of ['claude', 'shell'] as const) {
        const id = ptyByKey.get(`${key}::${cmd}`);
        if (id) ptys.get(id)?.kill();
      }
      break;
    }
    case 'interrupt': {
      const session = sessions.get(normalizeProject(msg.project));
      void session?.interrupt();
      break;
    }
    case 'set_permission_mode': {
      const session = sessions.get(normalizeProject(msg.project));
      void session?.setPermissionMode(msg.mode as PermissionModeName);
      break;
    }
    case 'permission_decision': {
      if (!decidePermissionAny(msg.requestId, msg.decision, msg.updatedInput))
        send(ws, { ev: 'error', message: `Richiesta permesso sconosciuta: ${msg.requestId}` });
      break;
    }
    default:
      send(ws, { ev: 'error', message: `Operazione non supportata: ${(msg as { op: string }).op}` });
  }
}

wss.on('connection', (ws) => {
  const authTimer = setTimeout(() => {
    if (!authed.has(ws)) ws.close(4401, 'auth timeout');
  }, AUTH_TIMEOUT_MS);

  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw.toString()) as ClientMsg;
    } catch {
      send(ws, { ev: 'error', message: 'JSON non valido' });
      return;
    }

    if (!authed.has(ws)) {
      if (msg.op === 'auth' && tokenMatches(token, msg.token)) {
        clearTimeout(authTimer);
        authed.add(ws);
        send(ws, { ev: 'auth_ok', engineVersion: ENGINE_VERSION, home: homedir() });
        send(ws, { ev: 'projects', list: loadProjects() });
        send(ws, { ev: 'quickactions', list: loadQuickActions() });
      } else {
        ws.close(4401, 'unauthorized');
      }
      return;
    }

    handleMessage(ws, msg).catch((err) => send(ws, { ev: 'error', message: String(err) }));
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    authed.delete(ws);
  });
});

for (const host of HOSTS) {
  const server = createServer(handleHttp);
  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  server.on('error', (err) => console.error(`[engine] listener ${host} fallito:`, String(err)));
  server.listen(PORT, host, () => console.log(`[engine] claude-cockpit-engine v${ENGINE_VERSION} su ws://${host}:${PORT}`));
}
console.log(`[engine] UI statica: ${existsSync(UI_DIR) ? UI_DIR : 'assente (solo WS)'}`);
console.log(`[engine] token: ${TOKEN_PATH}`);

function launchTelegram(): TelegramGateway | null {
  return startTelegramGateway({
    prompt: (project, text) => promptProject(project, text),
    interrupt: (project) => void sessions.get(normalizeProject(project))?.interrupt(),
    reset: (project) => resetProject(project),
    status: (project) => {
      const p = normalizeProject(project);
      return { busy: busy.get(p) ?? false, model: sessions.has(p) ? 'sessione attiva' : null };
    },
    decidePermission: (requestId, decision) => decidePermissionAny(requestId, decision),
    subscribe: (fn) => {
      eventListeners.add(fn);
      return () => eventListeners.delete(fn);
    },
    listProjects: () => loadProjects(),
  });
}

/** Hot-reload da settings_set: ferma il gateway e lo rilancia con la config aggiornata. */
function restartTelegram(): void {
  telegram?.stop();
  telegram = launchTelegram();
}

let telegram = launchTelegram();
if (!telegram) console.log('[engine] gateway Telegram spento (manca telegram.json)');
