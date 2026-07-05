import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CockpitClient, type ConnState } from './ws';
import type { ProjectEntry, QuickActionEntry, ServerMsg } from './protocol';
import type { PermissionDecision } from './protocol';
import { buildItemsFromMessages, emptyProject, toolResultText, type PendingPermission, type ProjectState, type QueuedPrompt, type Todo } from './model';
import { ChatView } from './components/ChatView';
import { Composer } from './components/Composer';
import { TodoPanel } from './components/TodoPanel';
import { PermissionPrompt } from './components/PermissionPrompt';
import { ProjectSwitcher } from './components/ProjectSwitcher';
import { QuickActions } from './components/QuickActions';
import { ModelSelect } from './components/ModelSelect';
import { TerminalPanel } from './components/Terminal';
import { McpStatus } from './components/McpStatus';
import { SessionPicker } from './components/SessionPicker';
import { MdViewer, type ViewerState } from './components/MdViewer';
import { FileNav } from './components/FileNav';
import { Tabs } from './components/Tabs';
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
  const [terminal, setTerminal] = useState<{ project: string; cmd: 'claude' | 'shell' } | null>(null);
  const [notifyOn, setNotifyOn] = useState(true);
  const [picker, setPicker] = useState(false);
  const [sideOpen, setSideOpen] = useState(() => localStorage.getItem('cockpit-side') === '1');
  const [viewer, setViewer] = useState<ViewerState | null>(null);
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
          setEngineError(null);
          setActiveProject((cur) => cur || msg.home);
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
            contextTokens: inTok + outTok,
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
          notifyHidden(
            t('taskDone')(shortOf(msg.project)),
            msg.subtype === 'success' ? (msg.result?.slice(0, 140) ?? t('completed')) : t('resultError')(msg.subtype),
          );
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

  const active = projects[activeKey] ?? emptyProject();
  const shortProject = activeProject.split('/').filter(Boolean).at(-1) || '~';
  const req = pending.find((p) => p.project === activeProject) ?? pending[0];
  const busyMap = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const [key, st] of Object.entries(projects)) {
      const base = key.split('##')[0];
      m[base] = (m[base] ?? false) || st.busy;
    }
    return m;
  }, [projects]);
  const tabBusy = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const t of tabs) m[t] = projects[t === 'main' ? activeProject : `${activeProject}##${t}`]?.busy ?? false;
    return m;
  }, [projects, tabs, activeProject]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Claude Cockpit <span className="proj">{shortProject}</span>
        </div>
        <div className="status">
          {conn === 'authed' && (
            <>
              {active.costUsd > 0 && (
                <span className="cost" title={t('costTitle')}>
                  ${active.costUsd.toFixed(2)} · {Math.round((active.tokensIn + active.tokensOut) / 1000)}k
                </span>
              )}
              {active.contextTokens > 0 && (
                <span
                  className={`ctx ${active.contextTokens > 160_000 ? 'hot' : active.contextTokens > 100_000 ? 'warm' : ''}`}
                  title={t('ctxTitle')(Math.round(active.contextTokens / 1000))}
                >
                  ctx {Math.min(99, Math.round((active.contextTokens / 200_000) * 100))}%
                </span>
              )}
              <button className="mini ghost" title={t('newChatTitle')} onClick={() => resetSession()}>
                {t('newChat')}
              </button>
              <button
                className={picker ? 'mini on' : 'mini ghost'}
                title={t('historyTitle')}
                onClick={() => {
                  if (!picker && activeProject) client.current?.send({ op: 'sessions_list', project: activeProject });
                  setPicker((p) => !p);
                }}
              >
                {t('history')}
              </button>
              <button
                className={ttsOn ? 'mini on' : 'mini ghost'}
                title={t('ttsTitle')}
                onClick={() =>
                  setTtsOn((on) => {
                    const next = !on;
                    localStorage.setItem('cockpit-tts', next ? '1' : '0');
                    if (!next && 'speechSynthesis' in window) speechSynthesis.cancel();
                    return next;
                  })
                }
              >
                🔊
              </button>
              <button className={notifyOn ? 'mini on' : 'mini ghost'} title={t('notifyTitle')} onClick={toggleNotify}>
                🔔
              </button>
              <button
                className={terminal ? 'mini on' : 'mini ghost'}
                onClick={() => setTerminal((t) => (t ? null : { project: activeProject, cmd: 'claude' }))}
              >
                {t('terminal')}
              </button>
              <div className="provider-toggle" title={t('providerTitle')}>
                {(['claude', 'glm'] as const).map((p) => (
                  <button
                    key={p}
                    className={active.provider === p ? 'prov on' : 'prov'}
                    onClick={() => {
                      if (active.provider !== p) client.current?.send({ op: 'set_provider', project: activeKey, provider: p });
                    }}
                  >
                    {p === 'claude' ? 'Claude' : 'GLM'}
                  </button>
                ))}
              </div>
              {active.provider === 'glm' ? (
                <span className="model-static" title={t('glmModelTitle')}>
                  {active.model || 'glm…'}
                </span>
              ) : (
                <ModelSelect models={active.models} current={active.model} onChange={changeModel} />
              )}
              <select
                className="effort-select"
                title={t('effortTitle')}
                value={active.effort}
                onChange={(e) => changeEffort(e.target.value)}
              >
                <option value="" disabled>
                  effort…
                </option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="xhigh">xhigh</option>
              </select>
            </>
          )}
          <button
            className={sideOpen ? 'mini on' : 'mini ghost'}
            title={t('sidePanelTitle')}
            onClick={() =>
              setSideOpen((o) => {
                localStorage.setItem('cockpit-side', o ? '0' : '1');
                return !o;
              })
            }
          >
            ☰
          </button>
          <span className={`dot ${conn}`} />
          {conn === 'authed' ? t('connected') : conn}
          {conn === 'disconnected' && (
            <button className="mini" onClick={onStartEngine}>
              {t('startEngine')}
            </button>
          )}
        </div>
      </header>

      {engineError && (
        <div className="banner error">
          {engineError}
          <button className="mini" onClick={() => resetSession()}>
            {t('newSession')}
          </button>
          <button className="mini ghost" onClick={() => setEngineError(null)}>
            ✕
          </button>
        </div>
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
                  project: { path, name: path.split('/').filter(Boolean).at(-1) ?? path, icon: '📁' },
                })
              }
              onRemoveProject={(path) => client.current?.send({ op: 'projects_remove', path })}
              onOpenFile={openFile}
              onAskClaude={(path) => composerInsert.current?.(path)}
              onOpenTerminal={(path) => setTerminal({ project: path, cmd: 'shell' })}
            />
          )}
        </ProjectSwitcher>
        <div className="rail-resizer" title={t('resizerTitle')} onMouseDown={startRailResize} />
        <div className="main">
          <Tabs
            tabs={tabs}
            active={activeTab}
            busy={tabBusy}
            onSelect={(t) => setActiveTabByProject((prev) => ({ ...prev, [activeProject]: t }))}
            onAdd={() => {
              const n = tabs.filter((t) => t !== 'main').reduce((max, t) => Math.max(max, parseInt(t.slice(1)) || 0), 1) + 1;
              const id = `t${n}`;
              setTabs(activeProject, (list) => [...list, id]);
              setActiveTabByProject((prev) => ({ ...prev, [activeProject]: id }));
            }}
            onClose={(t) => {
              const key = t === 'main' ? activeProject : `${activeProject}##${t}`;
              client.current?.send({ op: 'session_reset', project: key });
              warmed.current.delete(key);
              setTabs(activeProject, (list) => list.filter((x) => x !== t));
              setActiveTabByProject((prev) => ({ ...prev, [activeProject]: 'main' }));
            }}
          />
          {picker && (
            <SessionPicker
              sessions={active.sessions}
              searchResults={active.searchResults}
              currentId={active.sessionId}
              onSearch={(query) => {
                if (query) client.current?.send({ op: 'sessions_search', project: activeProject, query });
                else updateProject(activeProject, (s) => ({ ...s, searchResults: null }));
              }}
              onOpen={(sessionId) => {
                client.current?.send({ op: 'session_open', project: activeKey, sessionId });
                setPicker(false);
              }}
              onClose={() => setPicker(false)}
            />
          )}
          <ChatView items={active.items} thinkingSince={active.thinkingSince} onOpenFile={openFile} />
          {terminal && client.current && (
            <div className="term-panel">
              <div className="term-bar">
                <span>
                  {t('terminal')} · {terminal.cmd} · {terminal.project.split('/').filter(Boolean).at(-1) || '~'}
                </span>
                <div className="term-bar-actions">
                  <button
                    onClick={() => setTerminal((t) => (t ? { ...t, cmd: t.cmd === 'claude' ? 'shell' : 'claude' } : t))}
                  >
                    {terminal.cmd === 'claude' ? 'shell' : 'claude'}
                  </button>
                  <button onClick={() => setTerminal(null)}>{t('close')}</button>
                </div>
              </div>
              <TerminalPanel
                key={`${terminal.project}:${terminal.cmd}`}
                client={client.current}
                project={terminal.project}
                cmd={terminal.cmd}
                subscribe={(fn) => client.current!.subscribe(fn)}
              />
            </div>
          )}
          <QuickActions actions={quickActions} disabled={conn !== 'authed' || active.busy} onRun={(t) => submit(t)} />
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
            onSend={(t, imgs) => submit(t, imgs)}
            onInterrupt={interrupt}
            insertRef={composerInsert}
          />
        </div>
        {sideOpen && <div className="side-backdrop mobile-only" onClick={() => setSideOpen(false)} />}
        <aside className={sideOpen ? 'side open' : 'side'}>
          <TodoPanel todos={active.todos} />
          <McpStatus servers={active.mcpServers} onRefresh={refreshMcp} />
        </aside>
      </div>

      {viewer && <MdViewer viewer={viewer} onClose={() => setViewer(null)} />}
      {req && <PermissionPrompt req={req} onDecide={(d, input) => decide(req.requestId, d, input)} />}
    </div>
  );
}
