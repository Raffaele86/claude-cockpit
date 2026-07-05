// Modello dati della UI: timeline di item + stato per progetto.
import type { HistoryMessage, SearchResult, SessionSummary } from './protocol';

export type ToolStatus = 'running' | 'done' | 'error';

export type Item =
  | { kind: 'user'; id: string; text: string; imageCount?: number }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'thinking'; id: string; text: string }
  | {
      kind: 'tool';
      id: string; // tool_use.id
      name: string;
      input: Record<string, unknown>;
      status: ToolStatus;
      result?: string;
    };

export interface Todo {
  content: string;
  status: string;
  activeForm?: string;
}

export interface PendingPermission {
  requestId: string;
  project: string;
  toolName: string;
  input: Record<string, unknown>;
  suggestions?: unknown[];
}

export interface ModelOption {
  model: string;
  displayName?: string;
}

export interface McpServer {
  name: string;
  status: string;
}

export interface QueuedPrompt {
  text: string;
  images?: { media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'; data: string }[];
}

export interface ProjectState {
  items: Item[];
  queue: QueuedPrompt[];
  contextTokens: number; // input+cache dell'ultimo turno ≈ contesto corrente
  sessions: SessionSummary[]; // cronologia chat del progetto (sessions_list)
  searchResults: SearchResult[] | null; // esito sessions_search (null = nessuna ricerca attiva)
  sessionId?: string; // sessione attiva (da init/session_opened)
  todos: Todo[];
  busy: boolean;
  model: string;
  effort: string; // '' = default sessione
  provider: 'claude' | 'glm';
  permissionMode: string;
  activeAssistantId: string | null;
  slashCommands: string[];
  models: ModelOption[];
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  thinkingSince: number | null; // epoch ms, null se non sta pensando
  mcpServers: McpServer[];
  mcpOp: { busy: boolean; error: string | null }; // add/remove server MCP in corso / esito
}

export function emptyProject(): ProjectState {
  return {
    items: [],
    queue: [],
    contextTokens: 0,
    sessions: [],
    searchResults: null,
    todos: [],
    busy: false,
    model: '',
    effort: '',
    provider: 'claude',
    permissionMode: 'default',
    activeAssistantId: null,
    slashCommands: [],
    models: [],
    costUsd: 0,
    tokensIn: 0,
    tokensOut: 0,
    thinkingSince: null,
    mcpServers: [],
    mcpOp: { busy: false, error: null },
  };
}

const SERVICE_TAGS = ['system-reminder', 'local-command-caveat', 'command-name', 'command-message', 'command-args', 'local-command-stdout'];

/** Rimuove i blocchi di servizio delle sessioni CLI (reminder, caveat, comandi locali) da un testo user. */
export function stripServiceBlocks(t: string): string {
  let out = t;
  for (const tag of SERVICE_TAGS) {
    out = out.replace(new RegExp(`<${tag}>[\\s\\S]*?(</${tag}>|$)`, 'g'), '');
  }
  return out.trim();
}

/** Testo "di servizio" residuo: non va mostrato in chat. */
export function isNoiseText(t: string): boolean {
  const s = t.trim();
  return (
    s === '' ||
    s.includes('Caveat: The messages below') ||
    s.startsWith('[Request interrupted') ||
    SERVICE_TAGS.some((tag) => s.includes(`<${tag}>`))
  );
}

/** Estrae il testo da un content di tool_result (stringa o array di blocchi). */
export function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (b && typeof b === 'object' && 'text' in b ? String((b as { text: unknown }).text ?? '') : ''))
      .join('');
  }
  return '';
}

/** Ricostruisce la timeline da SessionMessage[] (resume). Stessa logica dei casi live assistant/tool_result. */
export function buildItemsFromMessages(messages: HistoryMessage[]): { items: Item[]; todos: Todo[] } {
  const items: Item[] = [];
  let todos: Todo[] = [];
  for (const m of messages) {
    const content = (m.message as { content?: unknown } | null)?.content;
    if (m.type === 'assistant' && Array.isArray(content)) {
      for (const b of content as Array<{ type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string }>) {
        if (b.type === 'text' && b.text) items.push({ kind: 'assistant', id: crypto.randomUUID(), text: b.text });
        else if (b.type === 'tool_use' && b.id) {
          if (b.name === 'TodoWrite') todos = (b.input?.todos as Todo[]) ?? todos;
          else items.push({ kind: 'tool', id: b.id, name: b.name ?? 'tool', input: b.input ?? {}, status: 'done' });
        }
      }
    } else if (m.type === 'user') {
      if (typeof content === 'string') {
        const clean = stripServiceBlocks(content);
        if (clean && !isNoiseText(clean)) items.push({ kind: 'user', id: crypto.randomUUID(), text: clean });
      } else if (Array.isArray(content)) {
        const blocks = content as Array<{ type: string; tool_use_id?: string; content?: unknown; is_error?: boolean; text?: string }>;
        for (const b of blocks) {
          if (b.type === 'tool_result' && b.tool_use_id) {
            const t = items.find((it) => it.kind === 'tool' && it.id === b.tool_use_id) as Extract<Item, { kind: 'tool' }> | undefined;
            if (t) {
              t.status = b.is_error ? 'error' : 'done';
              t.result = toolResultText(b.content);
            }
          }
        }
        const txt = stripServiceBlocks(
          blocks
            .filter((b) => b.type === 'text')
            .map((b) => b.text ?? '')
            .join(''),
        );
        if (txt && !isNoiseText(txt)) items.push({ kind: 'user', id: crypto.randomUUID(), text: txt });
      }
    }
  }
  return { items, todos };
}
