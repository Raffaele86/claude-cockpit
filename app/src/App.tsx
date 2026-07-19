import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CockpitClient, type ConnState } from './ws';
import type { CatalogModel, CheckpointEntry, EngineStats, GlobalSearchResult, ProjectEntry, PtyLaunch, QuickActionEntry, ServerMsg, UsageDay } from './protocol';
import type { PermissionDecision } from './protocol';
import { buildItemsFromMessages, emptyProject, itemsToMarkdown, toolResultText, type PendingPermission, type ProjectState, type QueuedPrompt, type Todo } from './model';
import { ChatView } from './components/ChatView';
import { Composer } from './components/Composer';
import { TodoPanel } from './components/TodoPanel';
import { PermissionPrompt } from './components/PermissionPrompt';
import { ProjectSwitcher } from './components/ProjectSwitcher';
import { QuickActions } from './components/QuickActions';
import { TerminalPanel } from './components/Terminal';
import { McpStatus } from './components/McpStatus';
import { SessionPicker } from './components/SessionPicker';
import { MdViewer, type ViewerState } from './components/MdViewer';
import type { SettingsSnapshot } from './components/Settings';
import { FileNav } from './components/FileNav';
import { Tabs } from './components/Tabs';
import { Checkpoints } from './components/Checkpoints';
import { CommandPalette, type Command } from './components/CommandPalette';
import { OverflowMenu, type MenuItem } from './components/OverflowMenu';
import { SessionMenu } from './components/SessionMenu';
import { Icon } from './components/icons';

// Pannelli on-demand: chunk separati, caricati solo alla prima apertura.
const Settings = lazy(() => import('./components/Settings').then((m) => ({ default: m.Settings })));
const Doctor = lazy(() => import('./components/Doctor').then((m) => ({ default: m.Doctor })));
const UsagePanel = lazy(() => import('./components/UsagePanel').then((m) => ({ default: m.UsagePanel })));
const SystemPanel = lazy(() => import('./components/SystemPanel').then((m) => ({ default: m.SystemPanel })));
const Inbox = lazy(() => import('./components/Inbox').then((m) => ({ default: m.Inbox })));
import { useDictation } from './components/useDictation';
import { t, LOCALE } from './strings';

const shortOf = (p: string) => {
  const [base, tab] = p.split('##');
  const name = base.split('/').filter(Boolean).at(-1) || '~';
  return tab ? `${name} · ${tab}` : name;
};

function usageTokens(u: unknown): { inTok: number; outTok: number } {
  const x = (u ?? {}) as Record<string, number>;
  const inTok = (x.input_tokens || 0) + (x.cache_read_input_tokens || 0) + (x.cache_creation_input_tokens || 0);
  return { inTok, outTok: x.output_tokens || 0 };
}

/** Notifica solo se la finestra non è a fuoco (main gestisce desktop + ntfy telefono). */
function notifyHidden(title: string, body: string): void {
  if (typeof document !== 'undefined' && !document.hasFocus()) {
    void window.cockpit.notify({ title, body, phone: true });
  }
}

const PARAMS = new URLSearchParams(location.search);
const SMOKE = PARAMS.get('smoke'); // '1' (chat) | 'edit' | null
const SMOKE_DIR = PARAMS.get('dir') ?? '';

const MODES: { key: string; label: string }[] = [
  { key: 'default', label: 'Default' },
  { key: 'acceptEdits', label: 'Accept edits' },
  { key: 'plan', label: 'Plan' },
  { key: 'bypassPermissions', label: 'Bypass' },
];

const uuid = () => crypto.randomUUID();

export function App() {
  const [conn, setConn] = useState<ConnState>('connecting');
  const [projects, setProjects] = useState<Record<string, ProjectState>>({});
  const [activeProject, setActiveProject] = useState<string>('');
  const [registry, setRegistry] = useState<ProjectEntry[]>([]);
  const [quickActions, setQuickActions] = useState<QuickActionEntry[]>([]);
  const [pending, setPending] = useState<PendingPermission[]>([]);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [terminal, setTerminal] = useState<string | null>(null); // shell dal FileNav (pannello inferiore), path
  // Vista principale per scheda: si apre SEMPRE nel CLI; la Chat è una scelta manuale
  // che vale solo per la sessione corrente (stato in memoria, niente persistenza).
  const [viewByKey, setViewByKey] = useState<Record<string, 'cli' | 'chat' | 'win'>>({});
  const [cliNonce, setCliNonce] = useState<Record<string, number>>({}); // remount dopo /exit o relaunch
  const [cliExited, setCliExited] = useState<Record<string, boolean>>({});
  // Toolbar CLI: provider/modello/effort/mode scelti per scheda (solo per la sessione UI).
  const [cliProv, setCliProv] = useState<Record<string, string>>({});
  const [cliModel, setCliModel] = useState<Record<string, string>>({});
  const [cliEffort, setCliEffort] = useState<Record<string, string>>({});
  const [cliMode, setCliMode] = useState<Record<string, string>>({});
  const cliLaunchRef = useRef<Record<string, PtyLaunch | undefined>>({}); // one-shot: consumato al mount, mai ri-applicato al cambio scheda
  const cliInput = useRef<((text: string) => void) | null>(null);
  // Dettatura nella vista CLI: il testo trascritto viene digitato nel terminale (senza invio).
  const cliDict = useDictation(
    () => client.current,
    (text) => cliInput.current?.(text),
  );
  const [notifyOn, setNotifyOn] = useState(true);
  const [picker, setPicker] = useState(false);
  const [sideOpen, setSideOpen] = useState(() => localStorage.getItem('cockpit-side') === '1');
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mcpImportMsg, setMcpImportMsg] = useState<string | null>(null);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [cpOpen, setCpOpen] = useState(false);
  const [cp, setCp] = useState<{ list: CheckpointEntry[]; busy: boolean; error: string | null }>({ list: [], busy: false, error: null });
  const [usageOpen, setUsageOpen] = useState(false);
  const [usageDays, setUsageDays] = useState<UsageDay[] | null>(null);
  const [sysOpen, setSysOpen] = useState(false);
  const [sysStats, setSysStats] = useState<EngineStats | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cliActive, setCliActive] = useState<Record<string, boolean>>({}); // ev pty_activity: schede CLI con output recente
  const [ptySession, setPtySession] = useState<Record<string, string>>({}); // chiave → sessionId del pty claude (per i titoli)
  const [globalResults, setGlobalResults] = useState<GlobalSearchResult[] | null>(null); // ricerca cross-progetto
  // Meta locali delle schede (rinomina manuale + pin), persistite per chiave-canale.
  const [tabMeta, setTabMeta] = useState<Record<string, { name?: string; pin?: boolean }>>(() => {
    try {
      return JSON.parse(localStorage.getItem('cockpit-tab-meta') ?? '{}') as Record<string, { name?: string; pin?: boolean }>;
    } catch {
      return {};
    }
  });
  const updateTabMeta = useCallback((key: string, patch: { name?: string; pin?: boolean }) => {
    setTabMeta((prev) => {
      const merged = { ...prev[key], ...patch };
      const next = { ...prev, [key]: merged };
      if (!merged.name && !merged.pin) delete next[key];
      localStorage.setItem('cockpit-tab-meta', JSON.stringify(next));
      return next;
    });
  }, []);
  const [cfgMsg, setCfgMsg] = useState<string | null>(null); // esito import/export config
  const sessionsReqAt = useRef<Record<string, number>>({}); // base → ts ultima sessions_list (throttle titoli)
  const [catalog, setCatalog] = useState<Record<string, CatalogModel[]>>({});
  const [catalogLoading, setCatalogLoading] = useState<Record<string, boolean>>({});
  const activeProjectRef = useRef(''); // per gli handler WS (chiusura stabile)
  const connRef = useRef<ConnState>('connecting');

  // Checkpoint: la lista è per-progetto → ricaricala all'apertura del pannello e al cambio progetto.
  useEffect(() => {
    if (cpOpen && activeProject) client.current?.send({ op: 'checkpoint_list', project: activeProject });
  }, [cpOpen, activeProject]);

  // Titoli sessione: al cambio progetto carica la cronologia (fonte dei summary), con throttle.
  useEffect(() => {
    if (!activeProject) return;
    if (Date.now() - (sessionsReqAt.current[activeProject] ?? 0) > 15_000) {
      sessionsReqAt.current[activeProject] = Date.now();
      client.current?.send({ op: 'sessions_list', project: activeProject });
    }
  }, [activeProject]);

  // Report uso: richiesto a ogni apertura del pannello (l'engine ha la sua cache incrementale).
  useEffect(() => {
    if (usageOpen) {
      setUsageDays(null);
      client.current?.send({ op: 'usage_report' });
    }
  }, [usageOpen]);

  // Sistema: statistiche engine all'apertura + polling ogni 5s finché il pannello resta aperto.
  useEffect(() => {
    if (!sysOpen) return;
    setSysStats(null);
    client.current?.send({ op: 'engine_stats' });
    const id = setInterval(() => client.current?.send({ op: 'engine_stats' }), 5000);
    return () => clearInterval(id);
  }, [sysOpen]);

  // Doctor automatico: nell'app desktop, se dopo qualche secondo non siamo connessi
  // all'engine c'è quasi certamente un prerequisito mancante → apri la verifica.
  useEffect(() => {
    if (!navigator.userAgent.includes('Electron')) return;
    const id = setTimeout(() => {
      if (connRef.current !== 'authed') setDoctorOpen(true);
    }, 6000);
    return () => clearTimeout(id);
  }, []);
  const [settingsSnap, setSettingsSnap] = useState<SettingsSnapshot | null>(null);
  const [engineVersion, setEngineVersion] = useState('');
  const [ttsOn, setTtsOn] = useState(() => localStorage.getItem('cockpit-tts') === '1');
  const [railW, setRailW] = useState(() => Number(localStorage.getItem('cockpit-rail-w')) || 200);
  const ttsRef = useRef(ttsOn);
  ttsRef.current = ttsOn;

  // Multi-istanza: schede per progetto. Chiave canale = path (main) o `${path}##${tab}`.
  const [tabsByProject, setTabsByProject] = useState<Record<string, string[]>>(() => {
    try {
      return JSON.parse(localStorage.getItem('cockpit-tabs') || '{}');
    } catch {
      return {};
    }
  });
  const [activeTabByProject, setActiveTabByProject] = useState<Record<string, string>>({});
  activeProjectRef.current = activeProject;
  connRef.current = conn;
  const tabs = tabsByProject[activeProject] ?? ['main'];
  const activeTab = tabs.includes(activeTabByProject[activeProject] ?? 'main') ? (activeTabByProject[activeProject] ?? 'main') : tabs[0];
  const activeKey = activeTab === 'main' ? activeProject : `${activeProject}##${activeTab}`;

  const setTabs = useCallback((path: string, fn: (t: string[]) => string[]) => {
    setTabsByProject((prev) => {
      const next = { ...prev, [path]: fn(prev[path] ?? ['main']) };
      localStorage.setItem('cockpit-tabs', JSON.stringify(next));
      return next;
    });
  }, []);

  const home = useRef<string>('');
  const client = useRef<CockpitClient | null>(null);
  const projectsRef = useRef<Record<string, ProjectState>>({});
  projectsRef.current = projects;
  const warmed = useRef<Set<string>>(new Set());

  const updateProject = useCallback((path: string, fn: (s: ProjectState) => ProjectState) => {
    setProjects((prev) => ({ ...prev, [path]: fn(prev[path] ?? emptyProject()) }));
  }, []);

  const submit = useCallback(
    (text: string, images?: QueuedPrompt['images'], projectPath?: string) => {
      const t = text.trim();
      const project = projectPath ?? activeKey;
      if (!t || !project) return;
      if (projectsRef.current[project]?.busy ?? false) {
        // Turno in corso: accoda, verrà inviato al prossimo result.
        updateProject(project, (s) => ({ ...s, queue: [...s.queue, { text: t, images }] }));
        return;
      }
      const userId = uuid();
      const asstId = uuid();
      updateProject(project, (s) => ({
        ...s,
        busy: true,
        activeAssistantId: asstId,
        items: [
          ...s.items,
          { kind: 'user', id: userId, text: t, imageCount: images?.length },
          { kind: 'assistant', id: asstId, text: '' },
        ],
      }));
      client.current?.send({ op: 'prompt', project, text: t, images });
    },
    [activeKey, updateProject],
  );

  const submitRef = useRef(submit);
  submitRef.current = submit;
  const composerInsert = useRef<((text: string) => void) | null>(null);

  const openFile = useCallback(
    (path: string) => {
      setViewer({ path });
      client.current?.send({ op: 'file_read', project: activeProject, path });
    },
    [activeProject],
  );

  const resetSession = useCallback(
    (project?: string) => {
      const p = project ?? activeKey;
      if (!p) return;
      client.current?.send({ op: 'session_reset', project: p });
      setEngineError(null);
    },
    [activeKey],
  );

  const interrupt = useCallback(() => {
    if (activeKey) client.current?.send({ op: 'interrupt', project: activeKey });
  }, [activeKey]);

  const setMode = useCallback(
    (mode: string) => {
      if (!activeKey) return;
      client.current?.send({ op: 'set_permission_mode', project: activeKey, mode: mode as never });
      updateProject(activeKey, (s) => ({ ...s, permissionMode: mode }));
    },
    [activeKey, updateProject],
  );

  const changeEffort = useCallback(
    (effort: string) => {
      if (!activeKey || !effort) return;
      client.current?.send({ op: 'set_effort', project: activeKey, effort: effort as never });
      updateProject(activeKey, (s) => ({ ...s, effort }));
    },
    [activeKey, updateProject],
  );

  const changeModel = useCallback(
    (model: string) => {
      if (!activeKey) return;
      client.current?.send({ op: 'set_model', project: activeKey, model });
      updateProject(activeKey, (s) => ({ ...s, model }));
    },
    [activeKey, updateProject],
  );

  // Trascinamento del bordo destro della rail (desktop): larghezza persistita.
  const startRailResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = Number(localStorage.getItem('cockpit-rail-w')) || 200;
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(480, Math.max(140, startW + ev.clientX - startX));
      setRailW(w);
    };
    const onUp = (ev: MouseEvent) => {
      const w = Math.min(480, Math.max(140, startW + ev.clientX - startX));
      localStorage.setItem('cockpit-rail-w', String(w));
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const decide = useCallback((requestId: string, decision: PermissionDecision, updatedInput?: Record<string, unknown>) => {
    client.current?.send({ op: 'permission_decision', requestId, decision, updatedInput });
    setPending((prev) => prev.filter((p) => p.requestId !== requestId));
  }, []);

  const handle = useCallback(
    (msg: ServerMsg) => {
      switch (msg.ev) {
        case 'auth_ok':
          home.current = msg.home;
          setEngineVersion(msg.engineVersion);
          setEngineError(null);
          setActiveProject((cur) => cur || msg.home);
          client.current?.send({ op: 'settings_get' }); // per la lista modelli GLM del selettore
          break;
        case 'projects':
          setRegistry(msg.list);
          break;
        case 'quickactions':
          setQuickActions(msg.list);
          break;
        case 'models':
          updateProject(msg.project, (s) => ({ ...s, models: msg.models }));
          break;
        case 'init':
          updateProject(msg.project, (s) => ({
            ...s,
            sessionId: msg.session_id,
            model: s.model || msg.model,
            permissionMode: msg.permissionMode,
            slashCommands: msg.slash_commands,
          }));
          break;
        case 'stream': {
          const e = msg.event as {
            type?: string;
            content_block?: { type?: string };
            delta?: { type?: string; text?: string };
          };
          const d = e.delta as { type?: string; text?: string; thinking?: string } | undefined;
          const isThinking =
            (e.type === 'content_block_start' && e.content_block?.type === 'thinking') ||
            (e.type === 'content_block_delta' && d?.type === 'thinking_delta');
          if (isThinking) {
            const chunk = (e.type === 'content_block_delta' && d?.thinking) || '';
            updateProject(msg.project, (s) => {
              const base = s.thinkingSince ? s : { ...s, thinkingSince: Date.now() };
              if (!chunk) return base;
              const items = [...base.items];
              // Il placeholder assistant vuoto sta in coda: il thinking va PRIMA della risposta.
              const anchor =
                items.at(-1)?.kind === 'assistant' && (items.at(-1) as { text: string }).text === '' ? items.length - 1 : items.length;
              const prev = items[anchor - 1];
              if (prev?.kind === 'thinking') {
                items[anchor - 1] = { ...prev, text: prev.text + chunk };
              } else {
                items.splice(anchor, 0, { kind: 'thinking', id: uuid(), text: chunk });
              }
              return { ...base, items };
            });
          } else if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta' && e.delta.text) {
            const delta = e.delta.text;
            updateProject(msg.project, (s) => {
              const cleared = s.thinkingSince !== null ? { thinkingSince: null } : {};
              let id = s.activeAssistantId;
              if (!id) {
                id = uuid();
                return { ...s, ...cleared, activeAssistantId: id, items: [...s.items, { kind: 'assistant', id, text: delta }] };
              }
              return {
                ...s,
                ...cleared,
                items: s.items.map((it) => (it.kind === 'assistant' && it.id === id ? { ...it, text: it.text + delta } : it)),
              };
            });
          }
          break;
        }
        case 'assistant': {
          const content = ((msg.message as { content?: unknown }).content ?? []) as Array<{
            type: string;
            id?: string;
            name?: string;
            input?: Record<string, unknown>;
            text?: string;
          }>;
          updateProject(msg.project, (s) => {
            let items = s.items;
            let activeId = s.activeAssistantId;
            let todos = s.todos;
            for (const b of content) {
              if (b.type === 'text' && b.text) {
                if (!activeId) {
                  activeId = uuid();
                  items = [...items, { kind: 'assistant', id: activeId, text: b.text }];
                } else {
                  const fillId = activeId;
                  items = items.map((it) =>
                    it.kind === 'assistant' && it.id === fillId && it.text === '' ? { ...it, text: b.text! } : it,
                  );
                }
              } else if (b.type === 'tool_use' && b.id) {
                if (b.name === 'TodoWrite') {
                  todos = (b.input?.todos as Todo[]) ?? todos;
                } else if (!items.some((it) => it.kind === 'tool' && it.id === b.id)) {
                  items = [...items, { kind: 'tool', id: b.id, name: b.name ?? 'tool', input: b.input ?? {}, status: 'running' }];
                  activeId = null;
                }
              }
            }
            return { ...s, items, activeAssistantId: activeId, todos };
          });
          break;
        }
        case 'tool_result': {
          const content = ((msg.message as { content?: unknown }).content ?? []) as Array<{
            type: string;
            tool_use_id?: string;
            content?: unknown;
            is_error?: boolean;
          }>;
          updateProject(msg.project, (s) => ({
            ...s,
            items: s.items.map((it) => {
              if (it.kind !== 'tool') return it;
              const b = content.find((c) => c.type === 'tool_result' && c.tool_use_id === it.id);
              if (!b) return it;
              return { ...it, status: b.is_error ? 'error' : 'done', result: toolResultText(b.content) };
            }),
          }));
          break;
        }
        case 'result': {
          const { inTok, outTok } = usageTokens(msg.usage);
          updateProject(msg.project, (s) => ({
            ...s,
            busy: false,
            activeAssistantId: null,
            thinkingSince: null,
            costUsd: s.costUsd + (msg.cost_usd || 0),
            tokensIn: s.tokensIn + inTok,
            tokensOut: s.tokensOut + outTok,
          }));
          // Coda: invia il prossimo prompt in attesa (fuori dal setState, stato già aggiornato).
          setTimeout(() => {
            const st = projectsRef.current[msg.project];
            const next = st?.queue[0];
            if (next && !st.busy) {
              updateProject(msg.project, (s) => ({ ...s, queue: s.queue.slice(1) }));
              submitRef.current(next.text, next.images, msg.project);
            }
          }, 0);
          if (ttsRef.current && msg.subtype === 'success' && msg.result && 'speechSynthesis' in window) {
            const u = new SpeechSynthesisUtterance(msg.result.replace(/[`*#_\[\]()>|-]/g, ' ').slice(0, 500));
            u.lang = LOCALE;
            speechSynthesis.cancel();
            speechSynthesis.speak(u);
          }
          {
            // Notifica ricca: risultato + costo/turni/file toccati (dalla timeline del progetto).
            const st = projectsRef.current[msg.project];
            const paths = [
              ...new Set(
                (st?.items ?? [])
                  .filter((i) => i.kind === 'tool' && ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(i.name) && i.status === 'done')
                  .map((i) => String((i as { input: Record<string, unknown> }).input.file_path ?? '').split('/').at(-1))
                  .filter(Boolean),
              ),
            ];
            const files = paths.slice(0, 3).join(', ') + (paths.length > 3 ? ` (+${paths.length - 3})` : '');
            const summary = t('notifSummary')(`$${(msg.cost_usd || 0).toFixed(2)}`, msg.num_turns, files);
            notifyHidden(
              t('taskDone')(shortOf(msg.project)),
              msg.subtype === 'success' ? `${msg.result?.slice(0, 140) ?? t('completed')}\n${summary}` : t('resultError')(msg.subtype),
            );
          }
          {
            // Titoli sessione: a fine task il summary può essere nato/cambiato (throttle 15s per base).
            const base = msg.project.split('##')[0];
            if (Date.now() - (sessionsReqAt.current[base] ?? 0) > 15_000) {
              sessionsReqAt.current[base] = Date.now();
              client.current?.send({ op: 'sessions_list', project: base });
            }
          }
          if (SMOKE === '1') {
            const st = projectsRef.current[msg.project];
            const last = st?.items.filter((i) => i.kind === 'assistant').at(-1);
            console.log(`COCKPIT_SMOKE_OK len=${last && 'text' in last ? last.text.length : 0} cost=${msg.cost_usd}`);
          }
          if (SMOKE === 'edit') console.log(`COCKPIT_SMOKE_EDIT_DONE subtype=${msg.subtype}`);
          break;
        }
        case 'history': {
          const built = buildItemsFromMessages(msg.messages);
          updateProject(msg.project, (s) => (s.items.length > 0 ? s : { ...s, items: built.items, todos: built.todos }));
          if (SMOKE === 'restore') console.log(`COCKPIT_SMOKE_RESTORE items=${built.items.length} msgs=${msg.messages.length}`);
          break;
        }
        case 'mcp_status':
          updateProject(msg.project, (s) => ({ ...s, mcpServers: msg.servers }));
          break;
        case 'permission_resolved':
          // Decisa altrove (altra scheda/Telegram) o annullata: il prompt non è più valido.
          setPending((prev) => prev.filter((p) => p.requestId !== msg.requestId));
          break;
        case 'permission_mode':
          updateProject(msg.project, (s) => ({ ...s, permissionMode: msg.mode }));
          break;
        case 'context':
          updateProject(msg.project, (s) => ({
            ...s,
            ctx: { totalTokens: msg.totalTokens, maxTokens: msg.maxTokens, percentage: msg.percentage },
            branch: msg.branch,
          }));
          break;
        case 'checkpoint_list':
          if (msg.project === activeProjectRef.current) setCp((s) => ({ ...s, list: msg.checkpoints }));
          break;
        case 'checkpoint_done':
          if (msg.project === activeProjectRef.current) setCp((s) => ({ ...s, busy: false, error: msg.error ?? null }));
          break;
        case 'usage_report':
          setUsageDays(msg.days);
          break;
        case 'engine_stats':
          setSysStats(msg.stats);
          break;
        case 'proc_killed':
          if (msg.ok) client.current?.send({ op: 'engine_stats' });
          else setEngineError(t('sysKillFailed')(msg.pid, msg.error ?? ''));
          break;
        case 'pty_activity':
          setCliActive((m) => ({ ...m, [msg.project]: msg.active }));
          break;
        case 'pty_attach_ok':
          if (msg.cmd === 'claude' && msg.sessionId) setPtySession((m) => ({ ...m, [msg.project]: msg.sessionId! }));
          // Modello reale della sessione (dal jsonl/spawn): la toolbar non deve mostrare valori stantii.
          if (msg.cmd === 'claude') setCliModel((m) => ({ ...m, [msg.project]: msg.model ?? '' }));
          break;
        case 'sessions_search_all':
          setGlobalResults(msg.results);
          break;
        case 'config_export': {
          const blob = new Blob([JSON.stringify({ cockpitConfig: msg.files }, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'cockpit-config-backup.json';
          a.click();
          URL.revokeObjectURL(a.href);
          break;
        }
        case 'config_import_done':
          setCfgMsg(msg.error ? msg.error : t('cfgImportDone')(msg.written.length));
          break;
        case 'mcp_export': {
          // Scarica il file: stesso formato di ~/.claude.json (chiave mcpServers) → reimportabile ovunque.
          const blob = new Blob([JSON.stringify({ mcpServers: msg.servers }, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'cockpit-mcp-export.json';
          a.click();
          URL.revokeObjectURL(a.href);
          break;
        }
        case 'mcp_import_done': {
          const errs = Object.keys(msg.errors);
          setMcpImportMsg(t('mcpImportDone')(msg.added.length, errs.length) + (errs.length ? ` (${errs.join(', ')})` : ''));
          if (msg.added.length && activeProjectRef.current) client.current?.send({ op: 'mcp_status', project: activeProjectRef.current });
          break;
        }
        case 'mcp_op_done':
          updateProject(msg.project, (s) => ({ ...s, mcpOp: { busy: false, error: msg.error ?? null } }));
          break;
        case 'permission_request':
          setPending((prev) => [
            ...prev,
            {
              requestId: msg.requestId,
              project: msg.project,
              toolName: msg.toolName,
              input: msg.input as Record<string, unknown>,
              suggestions: msg.suggestions,
            },
          ]);
          notifyHidden(t('permissionNotify')(shortOf(msg.project)), msg.toolName);
          break;
        case 'session_closed':
          updateProject(msg.project, (s) => ({ ...s, busy: false }));
          warmed.current.delete(msg.project);
          break;
        case 'session_reset':
          updateProject(msg.project, (s) => ({
            ...emptyProject(),
            model: s.model,
            models: s.models,
            permissionMode: s.permissionMode,
            slashCommands: s.slashCommands,
            mcpServers: s.mcpServers,
          }));
          break;
        case 'sessions':
          updateProject(msg.project, (s) => ({ ...s, sessions: msg.sessions }));
          break;
        case 'provider_catalog':
          setCatalog((p) => ({ ...p, [msg.provider]: msg.models }));
          setCatalogLoading((p) => ({ ...p, [msg.provider]: false }));
          break;
        case 'provider':
          // La sessione viene ricreata dal provider nuovo: azzera modello/effort e ri-warma per mostrare il modello reale.
          updateProject(msg.project, (s) => ({ ...s, provider: msg.provider, model: '', models: [], effort: '' }));
          setTimeout(() => {
            client.current?.send({ op: 'open_project', project: msg.project });
            client.current?.send({ op: 'models_list', project: msg.project });
          }, 0);
          break;
        case 'sessions_search':
          updateProject(msg.project, (s) => ({ ...s, searchResults: msg.results }));
          break;
        case 'session_opened':
          // Svuota la timeline e ricaricala dalla sessione scelta (il case history popola solo se items è vuoto).
          updateProject(msg.project, (s) => ({
            ...emptyProject(),
            sessionId: msg.sessionId,
            sessions: s.sessions,
            model: s.model,
            models: s.models,
            permissionMode: s.permissionMode,
            slashCommands: s.slashCommands,
            mcpServers: s.mcpServers,
          }));
          setTimeout(() => client.current?.send({ op: 'history', project: msg.project }), 0);
          break;
        case 'settings':
          setSettingsSnap({ data: msg.data, restartRequired: msg.restartRequired, telegramActive: msg.telegramActive });
          break;
        case 'file_content':
          setViewer((v) => (v && v.path === msg.path ? { path: msg.path, content: msg.content, error: msg.error } : v));
          break;
        case 'error':
          setEngineError(msg.message);
          break;
      }
    },
    [updateProject],
  );

  useEffect(() => {
    const c = new CockpitClient(setConn, handle);
    client.current = c;
    let cancelled = false;
    window.cockpit.getToken().then((token) => {
      if (cancelled) return;
      if (token) c.start(token);
      else setEngineError(t('tokenNotFound'));
    });
    return () => {
      cancelled = true;
      c.stop();
    };
  }, [handle]);

  // Warm della sessione del progetto attivo: apre il processo claude, chiede model/storico/stato MCP.
  useEffect(() => {
    if (conn !== 'authed' || !activeKey || warmed.current.has(activeKey)) return;
    warmed.current.add(activeKey);
    client.current?.send({ op: 'open_project', project: activeKey });
    client.current?.send({ op: 'models_list', project: activeKey });
    client.current?.send({ op: 'history', project: activeKey });
    client.current?.send({ op: 'mcp_status', project: activeKey });
  }, [conn, activeKey]);

  // Carica lo stato notifiche dalla config all'avvio.
  useEffect(() => {
    void window.cockpit.getConfig().then((cfg) => setNotifyOn(cfg.notify));
  }, []);

  const toggleNotify = useCallback(() => {
    setNotifyOn((on) => {
      const next = !on;
      void window.cockpit.setConfig({ notify: next });
      return next;
    });
  }, []);

  const refreshMcp = useCallback(() => {
    if (activeProject) client.current?.send({ op: 'mcp_status', project: activeProject });
  }, [activeProject]);

  // Smoke edit: auto-approva il primo permesso in coda.
  useEffect(() => {
    if (SMOKE === 'edit' && pending.length > 0) {
      const p = pending[0];
      console.log(`COCKPIT_SMOKE_PERM name=${p.toolName}`);
      decide(p.requestId, 'allow-once');
    }
  }, [pending, decide]);

  // Smoke: invia il prompt appena autenticati.
  const smokeSent = useRef(false);
  useEffect(() => {
    if (!SMOKE || conn !== 'authed' || smokeSent.current) return;
    smokeSent.current = true;
    if (SMOKE === '1') {
      setTimeout(() => submit('Rispondi esattamente con la sola parola: ciao', undefined, home.current), 300);
    } else if (SMOKE === 'edit' && SMOKE_DIR) {
      setActiveProject(SMOKE_DIR);
      setTimeout(
        () => submit('Nel file hello.txt sostituisci la parola ciao con ciaone usando lo strumento Edit. Non fare altro.', undefined, SMOKE_DIR),
        300,
      );
    }
  }, [conn, submit]);

  async function onStartEngine() {
    const res = await window.cockpit.startEngine();
    if (!res.ok) setEngineError(t('engineStartFailed')(res.error ?? ''));
  }

  const view: 'cli' | 'chat' | 'win' = viewByKey[activeKey] ?? 'cli';
  const setView = useCallback(
    (v: 'cli' | 'chat' | 'win') => setViewByKey((prev) => ({ ...prev, [activeKey]: v })),
    [activeKey],
  );

  /** Primo attach CLI di questa chiave nella run corrente? → pty pulito. sessionStorage
   *  sopravvive al reload (pty persiste) e muore alla chiusura (riapertura = sessione nuova). */
  const takeCliFresh = useCallback(() => {
    const sk = `cli-fresh::${activeKey}`;
    if (sessionStorage.getItem(sk)) return false;
    sessionStorage.setItem(sk, '1');
    return true;
  }, [activeKey]);

  /** Nuova scheda = chat indipendente: id UNICO (mai riusato — un id riciclato si
   *  ri-attaccherebbe al pty di una scheda chiusa) → il primo attach è sempre fresco. */
  // Ctrl/⌘+K: palette. Listener in fase capture, così vince anche quando il focus è nel pty (xterm).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const exportChat = useCallback(() => {
    const items = projectsRef.current[activeKey]?.items ?? [];
    if (!items.length) return;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '');
    const blob = new Blob([itemsToMarkdown(items)], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cockpit-transcript-${stamp}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [activeKey]);

  const openSettings = useCallback(() => {
    setSettingsSnap(null);
    client.current?.send({ op: 'settings_get' });
    setSettingsOpen(true);
  }, []);

  const addTab = useCallback(() => {
    const id = `t${Date.now().toString(36)}`;
    setTabs(activeProject, (list) => [...list, id]);
    setActiveTabByProject((prev) => ({ ...prev, [activeProject]: id }));
  }, [activeProject, setTabs]);

  /** Rilancia il CLI della scheda coi flag scelti (l'engine riprende la sessione con --resume). */
  const relaunchCli = useCallback(
    (launch: PtyLaunch) => {
      cliLaunchRef.current[activeKey] = launch;
      setCliExited((p) => ({ ...p, [activeKey]: false }));
      setCliNonce((p) => ({ ...p, [activeKey]: (p[activeKey] ?? 0) + 1 }));
    },
    [activeKey],
  );

  /** Consuma il launch pendente della scheda (one-shot): i mount successivi — es. semplice
   *  cambio scheda — fanno attach puro senza MAI toccare il processo in corso. */
  const takeCliLaunch = useCallback(() => {
    const l = cliLaunchRef.current[activeKey];
    cliLaunchRef.current[activeKey] = undefined;
    return l;
  }, [activeKey]);

  const active = projects[activeKey] ?? emptyProject();
  // Provider disponibili (da providers.json, caricati all'auth_ok) e modelli per provider.
  const providerNames = useMemo(() => ['claude', ...Object.keys(settingsSnap?.data.providers ?? {})], [settingsSnap]);
  const providerModels = useCallback(
    (prov: string): string[] => {
      const g = settingsSnap?.data.providers[prov];
      return g?.models?.length ? g.models : g?.model ? [g.model] : [];
    },
    [settingsSnap],
  );
  // Provider con catalogo live (modelsUrl): chiedi/aggiorna la lista ogni volta che lo selezioni.
  const hasCatalog = useCallback((prov: string) => !!settingsSnap?.data.providers[prov]?.modelsUrl, [settingsSnap]);
  const requestCatalog = useCallback(
    (prov: string) => {
      if (prov === 'claude' || !hasCatalog(prov)) return;
      setCatalogLoading((p) => ({ ...p, [prov]: true }));
      client.current?.send({ op: 'provider_catalog', provider: prov });
    },
    [hasCatalog],
  );
  const shortProject = activeProject.split('/').filter(Boolean).at(-1) || '~';
  // Prompt permesso: vince quello della scheda attiva, poi quelli del progetto attivo (i pending
  // portano la chiave-canale ##tab: il vecchio confronto col solo base falliva sulle schede).
  const req =
    pending.find((p) => p.project === activeKey) ??
    pending.find((p) => p.project.split('##')[0] === activeProject) ??
    pending[0];
  const busyMap = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const [key, st] of Object.entries(projects)) {
      const base = key.split('##')[0];
      m[base] = (m[base] ?? false) || st.busy;
    }
    for (const [key, active] of Object.entries(cliActive)) {
      if (active) m[key.split('##')[0]] = true;
    }
    return m;
  }, [projects, cliActive]);
  // Titolo sessione per chiave-canale: sessionId (chat o pty) → summary dalla cronologia del progetto base.
  const titleByKey = useMemo(() => {
    const m: Record<string, string> = {};
    for (const key of new Set([...Object.keys(projects), ...Object.keys(ptySession)])) {
      const base = key.split('##')[0];
      const sid = projects[key]?.sessionId ?? ptySession[key];
      if (!sid) continue;
      const s = projects[base]?.sessions.find((x) => x.sessionId === sid);
      if (s?.summary && s.summary !== '(senza titolo)') m[key] = s.summary;
    }
    return m;
  }, [projects, ptySession]);

  // Inbox: una voce per ogni sessione con attività — chat (items/busy) o CLI (pty con output recente).
  const inboxEntries = useMemo(() => {
    const entries = Object.entries(projects)
      .filter(([key, s]) => s.busy || s.items.length > 0 || cliActive[key])
      .map(([key, s]) => {
        const last = s.items.filter((i) => i.kind === 'assistant').at(-1);
        return {
          key,
          name: shortOf(key),
          title: tabMeta[key]?.name ?? titleByKey[key],
          busy: s.busy || !!cliActive[key],
          hasPermission: pending.some((p) => p.project === key),
          snippet: (last && 'text' in last ? last.text : '').replace(/\s+/g, ' ').slice(0, 80) || (cliActive[key] ? t('inboxCliActive') : ''),
          costUsd: s.costUsd,
        };
      });
    // Schede CLI attive mai aperte in questo client (nessuno stato locale): voce minima.
    for (const [key, active] of Object.entries(cliActive)) {
      if (active && !projects[key])
        entries.push({ key, name: shortOf(key), title: tabMeta[key]?.name ?? titleByKey[key], busy: true, hasPermission: false, snippet: t('inboxCliActive'), costUsd: 0 });
    }
    return entries.sort((a, b) => Number(b.hasPermission) - Number(a.hasPermission) || Number(b.busy) - Number(a.busy));
  }, [projects, cliActive, titleByKey, pending, tabMeta]);
  const busyCount = inboxEntries.filter((e) => e.busy).length;
  const openFromInbox = useCallback((key: string) => {
    const [base, tab] = key.split('##');
    setActiveProject(base);
    setActiveTabByProject((m) => ({ ...m, [base]: tab ?? 'main' }));
    setInboxOpen(false);
  }, []);
  const tabBusy = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const t of tabs) {
      const key = t === 'main' ? activeProject : `${activeProject}##${t}`;
      m[t] = (projects[key]?.busy ?? false) || !!cliActive[key];
    }
    return m;
  }, [projects, tabs, activeProject, cliActive]);
  const tabTitles = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of tabs) {
      const key = t === 'main' ? activeProject : `${activeProject}##${t}`;
      const title = tabMeta[key]?.name ?? titleByKey[key]; // rinomina manuale > titolo AI
      if (title) m[t] = title;
    }
    return m;
  }, [tabs, activeProject, titleByKey, tabMeta]);
  // Ordine schede: le pinnate davanti (ordine relativo conservato).
  const displayTabs = useMemo(() => {
    const pinOf = (t: string) => (tabMeta[t === 'main' ? activeProject : `${activeProject}##${t}`]?.pin ? 0 : 1);
    return [...tabs].sort((a, b) => pinOf(a) - pinOf(b));
  }, [tabs, activeProject, tabMeta]);
  const tabPins = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const t of tabs) m[t] = !!tabMeta[t === 'main' ? activeProject : `${activeProject}##${t}`]?.pin;
    return m;
  }, [tabs, activeProject, tabMeta]);

  // Registry della command palette: costruito qui perché tutti gli handler vivono nel monolite.
  // Controlli di sessione view-aware (provider/modello/effort/permessi): condivisi
  // tra command palette e popover Sessione del pill.
  const sessionCtl = useMemo(() => {
    const cli = view !== 'chat'; // 'cli' (WSL) o 'win' (Windows nativo): entrambi terminale
    const curProv = cli ? (cliProv[activeKey] ?? 'claude') : active.provider;
    const curModel = cli ? (cliModel[activeKey] ?? '') : active.model;
    const curEffort = cli ? (cliEffort[activeKey] ?? '') : active.effort;
    const curMode = cli ? (cliMode[activeKey] ?? 'bypassPermissions') : active.permissionMode;
    const modelList: { id: string; label: string }[] =
      curProv === 'claude' ? active.models.map((m) => ({ id: m.model, label: m.displayName ?? m.model }))
      : hasCatalog(curProv) ? (catalog[curProv] ?? []).map((m) => ({ id: m.id, label: m.label ?? m.id }))
      : providerModels(curProv).map((m) => ({ id: m, label: m }));
    const setProv = (p: string) => {
      if (p === curProv) return;
      requestCatalog(p);
      if (cli) {
        setCliProv((prev) => ({ ...prev, [activeKey]: p }));
        setCliModel((prev) => ({ ...prev, [activeKey]: '' }));
        relaunchCli({ provider: p, continue: true, permissionMode: cliMode[activeKey] as PtyLaunch['permissionMode'] });
      } else {
        client.current?.send({ op: 'set_provider', project: activeKey, provider: p });
      }
    };
    const setModel = (m: string) => {
      if (cli) {
        setCliModel((prev) => ({ ...prev, [activeKey]: m }));
        cliInput.current?.(`/model ${m}\r`);
      } else changeModel(m);
    };
    const setEff = (ef: string) => {
      if (cli) {
        setCliEffort((prev) => ({ ...prev, [activeKey]: ef }));
        cliInput.current?.(`/effort ${ef}\r`);
      } else changeEffort(ef);
    };
    const setPerm = (mode: string) => {
      if (cli) {
        setCliMode((prev) => ({ ...prev, [activeKey]: mode }));
        relaunchCli({ permissionMode: mode as PtyLaunch['permissionMode'], continue: true, provider: cliProv[activeKey] ?? 'claude' });
      } else setMode(mode);
    };
    const modes: { key: string; label: string }[] = cli
      ? [
          { key: 'plan', label: 'Plan' },
          { key: 'bypassPermissions', label: 'Bypass' },
        ]
      : MODES;
    return { cli, curProv, curModel, curEffort, curMode, modelList, modes, setProv, setModel, setEff, setPerm };
  }, [view, activeKey, active, cliProv, cliModel, cliEffort, cliMode, hasCatalog, catalog, providerModels, requestCatalog, relaunchCli, changeModel, changeEffort, setMode]);

  const commands = useMemo<Command[]>(() => {
    if (conn !== 'authed') return [];
    const cli = view !== 'chat'; // 'cli' (WSL) o 'win' (Windows nativo): entrambi terminale
    const { curProv, curModel, curEffort, modelList, setProv, setModel, setEff } = sessionCtl;
    const out: Command[] = [
      {
        id: 'new-chat',
        label: cli ? t('cliNewChat') : t('newChat'),
        section: t('cpSecSession'),
        icon: 'plus',
        keywords: 'new nuova chat scheda tab',
        run: () => (cli ? addTab() : resetSession()),
      },
      {
        id: 'history',
        label: cli ? t('cliHistory') : t('history'),
        section: t('cpSecSession'),
        icon: 'clock',
        shortcut: cli ? '/resume' : undefined,
        keywords: 'history cronologia resume sessioni',
        run: () => {
          if (cli) cliInput.current?.('/resume\r');
          else {
            if (activeProject) client.current?.send({ op: 'sessions_list', project: activeProject });
            setPicker(true);
          }
        },
      },
      ...(!cli && active.items.length
        ? [{ id: 'export', label: t('exportChat'), section: t('cpSecSession'), icon: 'file' as const, keywords: 'export markdown transcript', run: exportChat }]
        : []),
      {
        id: 'project',
        label: t('cmdSwitchProject'),
        section: t('cpSecGoto'),
        icon: 'folder',
        keywords: 'project progetto switch',
        children: () =>
          registry.map((p) => ({ id: p.path, label: p.name, icon: 'folder' as const, on: p.path === activeProject, run: () => setActiveProject(p.path) })),
      },
      {
        id: 'view',
        label: `${t('cmdToggleView')} ${view === 'cli' ? 'Win' : view === 'win' ? 'Chat' : 'CLI'}`,
        section: t('cpSecGoto'),
        icon: 'terminal',
        keywords: 'view vista cli win chat toggle',
        run: () => setView(view === 'cli' ? 'win' : view === 'win' ? 'chat' : 'cli'),
      },
      {
        id: 'provider',
        label: t('cmdProvider'),
        section: t('cpSecModel'),
        icon: 'globe',
        keywords: 'provider claude glm openrouter',
        children: () => providerNames.map((p) => ({ id: p, label: p === 'claude' ? 'Claude' : p, on: p === curProv, run: () => setProv(p) })),
      },
      {
        id: 'model',
        label: t('cmdModel'),
        section: t('cpSecModel'),
        icon: 'sparkle',
        keywords: 'model modello',
        children: () => modelList.map((m) => ({ id: m.id, label: m.label, on: m.id === curModel, run: () => setModel(m.id) })),
      },
      {
        id: 'effort',
        label: t('cmdEffort'),
        section: t('cpSecModel'),
        icon: 'pulse',
        keywords: 'effort reasoning',
        children: () => ['low', 'medium', 'high', 'xhigh'].map((ef) => ({ id: ef, label: ef, on: ef === curEffort, run: () => setEff(ef) })),
      },
      {
        id: 'mode',
        label: t('cmdMode'),
        section: t('cpSecModel'),
        icon: 'lock',
        keywords: 'permessi mode plan bypass',
        children: () =>
          sessionCtl.modes.map((m) => ({ id: m.key, label: m.label, on: sessionCtl.curMode === m.key, run: () => sessionCtl.setPerm(m.key) })),
      },
      { id: 'inbox', label: t('inboxOpen'), section: t('cpSecPanels'), icon: 'inbox', keywords: 'inbox sessioni', run: () => setInboxOpen(true) },
      { id: 'usage', label: t('usageOpen'), section: t('cpSecPanels'), icon: 'chart', keywords: 'usage costi token', run: () => setUsageOpen(true) },
      { id: 'system', label: t('sysOpen'), section: t('cpSecPanels'), icon: 'pulse', keywords: 'sistema system ram processi memoria', run: () => setSysOpen(true) },
      { id: 'checkpoints', label: t('cpOpen'), section: t('cpSecPanels'), icon: 'camera', keywords: 'checkpoint snapshot restore', run: () => setCpOpen(true) },
      { id: 'doctor', label: t('docOpen'), section: t('cpSecPanels'), icon: 'pulse', keywords: 'doctor system check', run: () => setDoctorOpen(true) },
      { id: 'settings', label: t('settingsBtnTitle'), section: t('cpSecPanels'), icon: 'settings', keywords: 'settings impostazioni', run: openSettings },
      { id: 'win-cli', label: t('openOnWindows'), section: t('cpSecPanels'), icon: 'terminal', keywords: 'windows powershell chrome browser nativo', run: () => client.current?.send({ op: 'open_windows_cli', project: activeProject }) },
      {
        id: 'side',
        label: t('sidePanelTitle'),
        section: t('cpSecPanels'),
        icon: 'menu',
        on: sideOpen,
        keywords: 'todo mcp side panel',
        run: () =>
          setSideOpen((o) => {
            localStorage.setItem('cockpit-side', o ? '0' : '1');
            return !o;
          }),
      },
      ...quickActions
        .filter((q) => !q.project || q.project === activeProject)
        .map((q, i) => ({
          id: `qa-${i}`,
          label: q.label,
          section: t('cpSecQuick'),
          icon: 'play' as const,
          keywords: q.text,
          run: () => {
            if (cli) cliInput.current?.(q.text + '\r');
            else submit(q.text);
          },
        })),
      {
        id: 'tts',
        label: t('ttsTitle'),
        section: t('cpSecPrefs'),
        icon: 'speaker',
        on: ttsOn,
        keywords: 'tts voce leggi',
        run: () =>
          setTtsOn((on) => {
            const next = !on;
            localStorage.setItem('cockpit-tts', next ? '1' : '0');
            if (!next && 'speechSynthesis' in window) speechSynthesis.cancel();
            return next;
          }),
      },
      { id: 'notify', label: t('notifyTitle'), section: t('cpSecPrefs'), icon: 'bell', on: notifyOn, keywords: 'notifiche notifications', run: toggleNotify },
    ];
    return out;
  }, [
    conn, view, active, activeProject, registry, providerNames, quickActions,
    ttsOn, notifyOn, sideOpen, sessionCtl,
    addTab, resetSession, exportChat, setView, openSettings, submit, toggleNotify,
  ]);

  // Menu ⋯ della topbar: toggle rari + pannelli (le stesse azioni esistono anche in palette).
  const menuItems = useMemo<MenuItem[]>(
    () => [
      {
        id: 'tts',
        label: t('ttsTitle'),
        icon: 'speaker',
        on: ttsOn,
        run: () =>
          setTtsOn((on) => {
            const next = !on;
            localStorage.setItem('cockpit-tts', next ? '1' : '0');
            if (!next && 'speechSynthesis' in window) speechSynthesis.cancel();
            return next;
          }),
      },
      { id: 'notify', label: t('notifyTitle'), icon: 'bell', on: notifyOn, run: toggleNotify },
      { id: 'usage', label: t('usageOpen'), icon: 'chart', run: () => setUsageOpen(true) },
      { id: 'system', label: t('sysOpen'), icon: 'pulse', run: () => setSysOpen(true) },
      { id: 'checkpoints', label: t('cpOpen'), icon: 'camera', run: () => setCpOpen(true) },
      { id: 'doctor', label: t('docOpen'), icon: 'pulse', run: () => setDoctorOpen(true) },
      { id: 'settings', label: t('settingsTitle'), icon: 'settings', run: openSettings },
      {
        id: 'side',
        label: t('sidePanelTitle'),
        icon: 'menu',
        on: sideOpen,
        run: () =>
          setSideOpen((o) => {
            localStorage.setItem('cockpit-side', o ? '0' : '1');
            return !o;
          }),
      },
    ],
    [ttsOn, notifyOn, sideOpen, toggleNotify, openSettings],
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Claude Cockpit <span className="proj">{shortProject}</span>
        </div>
        {conn === 'authed' && (
          <div className="pill-wrap">
            <SessionMenu
              ctl={sessionCtl}
              providers={providerNames}
              onOpen={() => {
                if (hasCatalog(sessionCtl.curProv)) requestCatalog(sessionCtl.curProv);
              }}
            >
              <button className="session-pill" title={t('sessionPillTitle')}>
                <Icon name="sparkle" size={12} />
                <span className="pill-part">{(sessionCtl.curModel || 'model').split(',').pop()}</span>
                <span className="pill-sep">·</span>
                <span className="pill-part">{sessionCtl.curEffort || 'effort'}</span>
                <Icon name="chevron-down" size={11} />
              </button>
            </SessionMenu>
          </div>
        )}
        <div className="status">
          {conn === 'authed' && (
            <button
              className="mini ghost"
              title={view !== 'chat' ? t('cliNewChatTitle') : t('newChatTitle')}
              onClick={() => (view !== 'chat' ? addTab() : resetSession())}
            >
              {view !== 'chat' ? t('cliNewChat') : t('newChat')}
            </button>
          )}
          <button className="mini ghost" title={t('cpOpenTitle')} onClick={() => setPaletteOpen(true)}>
            <kbd className="kbd-chip">⌘K</kbd>
          </button>
          <button className={`has-badge btn-icon ${inboxOpen ? 'mini on' : 'mini ghost'}`} title={t('inboxOpen')} onClick={() => setInboxOpen((o) => !o)}>
            <Icon name="inbox" />
            {busyCount > 0 && <span className="badge-busy">{busyCount}</span>}
          </button>
          <OverflowMenu title={t('moreTitle')} items={menuItems} />
          <span className={`dot ${conn}`} title={conn === 'authed' ? t('connected') : conn} />
          {conn === 'disconnected' && (
            <button className="mini primary" onClick={onStartEngine}>
              {t('startEngine')}
            </button>
          )}
        </div>
      </header>

      {engineError && (
        <div className="banner error">
          {engineError}
          <button className="mini primary" onClick={() => resetSession()}>
            {t('newSession')}
          </button>
          <button className="mini ghost" onClick={() => setDoctorOpen(true)}>
            {t('docOpen')}
          </button>
          <button className="mini ghost btn-icon" onClick={() => setEngineError(null)}>
            <Icon name="close" />
          </button>
        </div>
      )}
      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />
      {doctorOpen && (
        <Suspense fallback={null}>
          <Doctor connected={conn === 'authed'} onStartEngine={() => void window.cockpit?.startEngine()} onClose={() => setDoctorOpen(false)} />
        </Suspense>
      )}
      {usageOpen && (
        <Suspense fallback={null}>
          <UsagePanel days={usageDays} onClose={() => setUsageOpen(false)} />
        </Suspense>
      )}
      {sysOpen && (
        <Suspense fallback={null}>
          <SystemPanel stats={sysStats} onClose={() => setSysOpen(false)} onKill={(pid) => client.current?.send({ op: 'proc_kill', pid })} />
        </Suspense>
      )}
      {inboxOpen && (
        <Suspense fallback={null}>
          <Inbox
            entries={inboxEntries}
            onOpen={openFromInbox}
            onStop={(key) => client.current?.send({ op: 'interrupt', project: key })}
            onClose={() => setInboxOpen(false)}
          />
        </Suspense>
      )}
      {cpOpen && (
        <Checkpoints
          checkpoints={cp.list}
          busy={cp.busy}
          error={cp.error}
          onCreate={(label) => {
            if (!activeProject) return;
            setCp((s) => ({ ...s, busy: true, error: null }));
            client.current?.send({ op: 'checkpoint_create', project: activeProject, label });
          }}
          onRestore={(file) => {
            if (!activeProject) return;
            setCp((s) => ({ ...s, busy: true, error: null }));
            client.current?.send({ op: 'checkpoint_restore', project: activeProject, file });
          }}
          onClose={() => setCpOpen(false)}
        />
      )}

      <div className="body">
        <ProjectSwitcher
          projects={registry}
          active={activeProject}
          busy={busyMap}
          width={railW}
          onSelect={setActiveProject}
          onAdd={(entry) => client.current?.send({ op: 'projects_upsert', project: entry })}
          onRemove={(path) => {
            client.current?.send({ op: 'projects_remove', path });
            if (path === activeProject) setActiveProject(home.current);
          }}
        >
          {conn === 'authed' && client.current && home.current && (
            <FileNav
              client={client.current}
              root={home.current}
              active={activeProject}
              registry={registry}
              onSelectProject={setActiveProject}
              onAddProject={(path) =>
                client.current?.send({
                  op: 'projects_upsert',
                  project: { path, name: path.split('/').filter(Boolean).at(-1) ?? path, icon: 'folder' },
                })
              }
              onRemoveProject={(path) => client.current?.send({ op: 'projects_remove', path })}
              onOpenFile={openFile}
              onAskClaude={(path) => composerInsert.current?.(path)}
              onOpenTerminal={(path) => setTerminal(path)}
            />
          )}
        </ProjectSwitcher>
        <div className="rail-resizer" title={t('resizerTitle')} onMouseDown={startRailResize} />
        <div className="main">
          <div className="tabs-row">
            <Tabs
              tabs={displayTabs}
              active={activeTab}
              busy={tabBusy}
              titles={tabTitles}
              pins={tabPins}
              onRename={(tb, name) => updateTabMeta(tb === 'main' ? activeProject : `${activeProject}##${tb}`, { name: name.trim() || undefined })}
              onTogglePin={(tb) => {
                const key = tb === 'main' ? activeProject : `${activeProject}##${tb}`;
                updateTabMeta(key, { pin: !tabMeta[key]?.pin });
              }}
              onSelect={(t) => setActiveTabByProject((prev) => ({ ...prev, [activeProject]: t }))}
              onAdd={addTab}
              onClose={(t) => {
                const key = t === 'main' ? activeProject : `${activeProject}##${t}`;
                client.current?.send({ op: 'session_reset', project: key });
                client.current?.send({ op: 'pty_kill_project', project: key }); // la scheda chiusa non lascia terminali zombie
                warmed.current.delete(key);
                setTabs(activeProject, (list) => list.filter((x) => x !== t));
                setActiveTabByProject((prev) => ({ ...prev, [activeProject]: 'main' }));
              }}
            />
            <div className="view-toggle" title={t('viewToggleTitle')}>
              {(['cli', 'win', 'chat'] as const).map((v) => (
                <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)} title={v === 'win' ? t('winViewTitle') : undefined}>
                  {v === 'cli' ? 'CLI' : v === 'win' ? 'Win' : t('chat')}
                </button>
              ))}
            </div>
          </div>
          {picker && (
            <SessionPicker
              sessions={active.sessions}
              searchResults={active.searchResults}
              globalResults={globalResults}
              currentId={active.sessionId}
              onSearch={(query) => {
                if (query) client.current?.send({ op: 'sessions_search', project: activeProject, query });
                else updateProject(activeProject, (s) => ({ ...s, searchResults: null }));
              }}
              onSearchAll={(query) => {
                setGlobalResults(null);
                client.current?.send({ op: 'sessions_search_all', query });
              }}
              onOpen={(sessionId) => {
                client.current?.send({ op: 'session_open', project: activeKey, sessionId });
                setPicker(false);
              }}
              onOpenGlobal={(r) => {
                setActiveProject(r.project);
                setActiveTabByProject((m) => ({ ...m, [r.project]: 'main' }));
                client.current?.send({ op: 'session_open', project: r.project, sessionId: r.sessionId });
                setPicker(false);
                setGlobalResults(null);
              }}
              onClose={() => setPicker(false)}
            />
          )}
          {view !== 'chat' && conn === 'authed' && client.current ? (
            <div className="cli-wrap">
              <TerminalPanel
                key={`${activeKey}:${view}:${cliNonce[activeKey] ?? 0}`}
                client={client.current}
                project={activeKey}
                cmd="claude"
                os={view === 'win' ? 'windows' : undefined}
                subscribe={(fn) => client.current!.subscribe(fn)}
                takeLaunch={takeCliLaunch}
                takeFresh={takeCliFresh}
                inputRef={cliInput}
                onExit={() => setCliExited((p) => ({ ...p, [activeKey]: true }))}
              />
              {cliExited[activeKey] && (
                <button
                  className="cli-restart"
                  onClick={() => {
                    setCliExited((p) => ({ ...p, [activeKey]: false }));
                    setCliNonce((p) => ({ ...p, [activeKey]: (p[activeKey] ?? 0) + 1 }));
                  }}
                >
                  <Icon name="refresh" size={13} /> {t('restartCli')}
                </button>
              )}
              <button
                className={`cli-mic ${cliDict.state}`}
                title={cliDict.state === 'busy' ? t('micTranscribing') : t('dictateTitle')}
                onClick={() => void cliDict.toggle()}
              >
                {cliDict.state === 'recording' ? <Icon name="record" /> : cliDict.state === 'busy' ? <Icon name="spinner" className="spin" /> : <Icon name="mic" />}
              </button>
              {cliDict.msg && (
                <div className="cli-mic-msg">
                  {cliDict.msg}
                  <button onClick={() => cliDict.setMsg(null)}><Icon name="close" size={12} /></button>
                </div>
              )}
            </div>
          ) : (
            <ChatView items={active.items} thinkingSince={active.thinkingSince} onOpenFile={openFile} />
          )}
          {terminal && client.current && (
            <div className="term-panel">
              <div className="term-bar">
                <span>
                  {t('terminal')} · shell · {shortOf(terminal)}
                </span>
                <div className="term-bar-actions">
                  <button onClick={() => setTerminal(null)}>{t('close')}</button>
                </div>
              </div>
              <TerminalPanel
                key={`${terminal}:shell`}
                client={client.current}
                project={terminal}
                cmd="shell"
                subscribe={(fn) => client.current!.subscribe(fn)}
              />
            </div>
          )}
          <QuickActions
            actions={quickActions.filter((q) => !q.project || q.project === activeProject)}
            disabled={conn !== 'authed' || (view === 'chat' && active.busy)}
            onRun={(text) => {
              if (view !== 'chat') cliInput.current?.(text + '\r');
              else submit(text);
            }}
          />
          {conn === 'authed' && view === 'chat' && (
            <div className="statusline">
              <span title={activeProject}><Icon name="folder" size={12} /> {shortOf(activeKey)}</span>
              {active.branch && <span><Icon name="branch" size={12} /> {active.branch}</span>}
              {active.model && <span>{active.model}</span>}
              {active.effort && <span>effort {active.effort}</span>}
              <span>{MODES.find((m) => m.key === active.permissionMode)?.label ?? active.permissionMode}</span>
              {active.ctx && (
                <span className={active.ctx.percentage > 80 ? 'sl-hot' : ''}>
                  ctx {Math.round(active.ctx.percentage)}% ({Math.round(active.ctx.totalTokens / 1000)}k/
                  {Math.round(active.ctx.maxTokens / 1000)}k)
                </span>
              )}
              {active.costUsd > 0 && <span>${active.costUsd.toFixed(2)}</span>}
              {active.sessionId && <span title={active.sessionId}>#{active.sessionId.slice(0, 8)}</span>}
            </div>
          )}
          {view === 'chat' && (
            <>
              <div className="modebar">
                {MODES.map((m) => (
                  <button key={m.key} className={active.permissionMode === m.key ? 'mode on' : 'mode'} onClick={() => setMode(m.key)}>
                    {m.label}
                  </button>
                ))}
              </div>
              <Composer
                disabled={conn !== 'authed'}
                busy={active.busy}
                queued={active.queue.length}
                slashCommands={active.slashCommands}
                client={client.current}
                onSend={(t, imgs) => submit(t, imgs)}
                onInterrupt={interrupt}
                insertRef={composerInsert}
              />
            </>
          )}
        </div>
        {sideOpen && <div className="side-backdrop mobile-only" onClick={() => setSideOpen(false)} />}
        <aside className={sideOpen ? 'side open' : 'side'}>
          <TodoPanel todos={active.todos} />
          <McpStatus
            servers={active.mcpServers}
            op={active.mcpOp}
            importMsg={mcpImportMsg}
            onRefresh={refreshMcp}
            onAdd={(server) => {
              updateProject(activeProject, (s) => ({ ...s, mcpOp: { busy: true, error: null } }));
              client.current?.send({ op: 'mcp_add', project: activeProject, server });
            }}
            onRemove={(name) => {
              updateProject(activeProject, (s) => ({ ...s, mcpOp: { busy: true, error: null } }));
              client.current?.send({ op: 'mcp_remove', project: activeProject, name });
            }}
            onExport={() => client.current?.send({ op: 'mcp_export' })}
            onImport={(servers) => {
              setMcpImportMsg('…');
              client.current?.send({ op: 'mcp_import', project: activeProject, servers });
            }}
          />
        </aside>
      </div>

      {viewer && <MdViewer viewer={viewer} onClose={() => setViewer(null)} />}
      {settingsOpen && (
        <Suspense fallback={null}>
          <Settings
            snapshot={settingsSnap}
            engineVersion={engineVersion}
            home={home.current}
            configMsg={cfgMsg}
            projects={registry}
            onConfigExport={() => client.current?.send({ op: 'config_export' })}
            onConfigImport={(files) => {
              setCfgMsg(null);
              client.current?.send({ op: 'config_import', files });
            }}
            onSave={(patch) => client.current?.send({ op: 'settings_set', patch })}
            onClose={() => setSettingsOpen(false)}
          />
        </Suspense>
      )}
      {req && <PermissionPrompt req={req} onDecide={(d, input) => decide(req.requestId, d, input)} />}
    </div>
  );
}
