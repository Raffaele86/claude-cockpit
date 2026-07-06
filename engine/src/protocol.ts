// Protocollo WS Cockpit — un JSON per messaggio.
// Questo file è la fonte di verità; una copia viene sincronizzata in app/ (npm run sync-protocol).

export type PermissionModeName = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

export type PermissionDecision = 'allow-once' | 'allow-always' | 'deny' | 'edit';

export type EffortName = 'low' | 'medium' | 'high' | 'xhigh';

export type ProviderName = 'claude' | 'glm';

export interface DirEntry {
  name: string;
  dir: boolean;
  project: boolean; // registry o contiene .claude/CLAUDE.md/.git
}

// ---- client → engine ----
export type ClientMsg =
  | { op: 'auth'; token: string }
  | { op: 'prompt'; project: string; text: string; model?: string; images?: PromptImage[] }
  | { op: 'session_reset'; project: string }
  | { op: 'sessions_list'; project: string }
  | { op: 'sessions_search'; project: string; query: string }
  | { op: 'session_open'; project: string; sessionId: string }
  | { op: 'interrupt'; project: string }
  | { op: 'set_permission_mode'; project: string; mode: PermissionModeName }
  | {
      op: 'permission_decision';
      requestId: string;
      decision: PermissionDecision;
      updatedInput?: Record<string, unknown>;
    }
  | { op: 'pty_attach'; project: string; cmd: 'claude' | 'shell'; cols: number; rows: number; launch?: PtyLaunch; fresh?: boolean } // riusa o crea; con launch: kill+respawn coi flag; fresh: kill+respawn pulito (sessione nuova)
  | { op: 'pty_input'; ptyId: string; data: string } // base64
  | { op: 'pty_resize'; ptyId: string; cols: number; rows: number }
  | { op: 'pty_kill'; ptyId: string } // termina il processo (il detach NON lo chiude)
  | { op: 'pty_kill_project'; project: string } // termina i pty (claude+shell) della chiave: chiusura scheda
  | { op: 'projects_list' }
  | { op: 'projects_upsert'; project: ProjectEntry }
  | { op: 'projects_remove'; path: string }
  | { op: 'open_project'; project: string }
  | { op: 'models_list'; project: string }
  | { op: 'set_model'; project: string; model: string }
  | { op: 'set_effort'; project: string; effort: EffortName }
  | { op: 'quickactions_list' }
  | { op: 'history'; project: string }
  | { op: 'mcp_status'; project: string }
  | { op: 'file_read'; project: string; path: string }
  | { op: 'dir_list'; path: string }
  | { op: 'file_op'; kind: 'mkdir' | 'rename' | 'delete' | 'reveal'; path: string; newName?: string }
  | { op: 'set_provider'; project: string; provider: ProviderName }
  | { op: 'settings_get' }
  | { op: 'settings_set'; patch: Partial<CockpitSettings> }
  | { op: 'stt'; audio: string; mime: string } // audio base64 (≤2MB) → trascrizione Whisper (lingua da config)
  | { op: 'mcp_add'; project: string; server: McpAddRequest }
  | { op: 'mcp_remove'; project: string; name: string };

// Aggiunta server MCP (wrapper di `claude mcp add`): target = URL (http/sse) o comando completo (stdio);
// headers = righe "Chiave: valore" (http/sse), env = righe "KEY=VALUE" (stdio).
// Rilancio del CLI con impostazioni: claude -c (--continue) mantiene la conversazione della cwd.
export interface PtyLaunch {
  provider?: ProviderName;
  model?: string;
  effort?: EffortName;
  permissionMode?: PermissionModeName;
  continue?: boolean;
}

export interface McpAddRequest {
  name: string;
  transport: 'http' | 'sse' | 'stdio';
  target: string;
  headers?: string[];
  env?: string[];
  scope: 'user' | 'project';
}

// Impostazioni engine (file in ~/.claude-cockpit). I segreti viaggiano mascherati (••••+ultimi 4):
// rimandare il valore mascherato in settings_set = "non toccare".
export interface CockpitSettings {
  telegram: {
    botToken?: string;
    chatId?: number;
    project?: string;
    sttApiKey?: string;
    sttProvider?: 'groq' | 'openai';
    sttLanguage?: string; // 'auto' | codice ISO (es. 'it') — dettatura E vocali Telegram
  };
  providers: { glm?: { configDir: string; model?: string; models?: string[] } }; // models = scelte del selettore (CLI /model, chat set_model)
  engine: { hosts: string[]; defaultPermissionMode?: PermissionModeName };
  quickactions: QuickActionEntry[];
}

export interface PromptImage {
  media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  data: string; // base64
}

export interface ProjectEntry {
  name: string;
  path: string;
  icon?: string;
}

export interface QuickActionEntry {
  label: string;
  text: string;
}

export interface ModelEntry {
  model: string;
  displayName?: string;
}

export interface McpServerEntry {
  name: string;
  status: string; // connected | failed | needs-auth | pending | disabled
}

export type SessionCategory = 'cockpit' | 'cli' | 'scheduler' | 'tech';

export interface SessionSummary {
  sessionId: string;
  summary: string;
  lastModified: number; // epoch ms
  category: SessionCategory;
}

export interface SearchResult extends SessionSummary {
  snippet: string; // contesto attorno al primo match nel contenuto
}

export interface HistoryMessage {
  type: 'user' | 'assistant' | 'system';
  message: unknown; // API message (content blocks)
}

// ---- engine → client ----
export type ServerMsg =
  | { ev: 'auth_ok'; engineVersion: string; home: string }
  | {
      ev: 'init';
      project: string;
      session_id: string;
      model: string;
      permissionMode: string;
      tools: string[];
      slash_commands: string[];
    }
  | { ev: 'stream'; project: string; event: unknown } // RawMessageStreamEvent
  | { ev: 'assistant'; project: string; message: unknown } // APIAssistantMessage
  | { ev: 'tool_result'; project: string; message: unknown } // APIUserMessage (tool_result blocks)
  | {
      ev: 'result';
      project: string;
      subtype: string;
      is_error: boolean;
      cost_usd: number;
      usage: unknown;
      num_turns: number;
      result?: string;
    }
  | {
      ev: 'permission_request';
      requestId: string;
      project: string;
      toolName: string;
      input: unknown;
      suggestions?: unknown[];
    }
  | { ev: 'pty_attach_ok'; ptyId: string; project: string; cmd: 'claude' | 'shell'; scrollback: string } // scrollback base64
  | { ev: 'pty_data'; ptyId: string; data: string } // base64
  | { ev: 'pty_exit'; ptyId: string; exitCode: number }
  | { ev: 'projects'; list: ProjectEntry[] }
  | { ev: 'quickactions'; list: QuickActionEntry[] }
  | { ev: 'models'; project: string; models: ModelEntry[] }
  | { ev: 'history'; project: string; messages: HistoryMessage[] }
  | { ev: 'mcp_status'; project: string; servers: McpServerEntry[] }
  | { ev: 'session_closed'; project: string }
  | { ev: 'session_reset'; project: string }
  | { ev: 'sessions'; project: string; sessions: SessionSummary[] }
  | { ev: 'sessions_search'; project: string; query: string; results: SearchResult[] }
  | { ev: 'session_opened'; project: string; sessionId: string }
  | { ev: 'file_content'; project: string; path: string; content?: string; error?: string }
  | { ev: 'dir_entries'; path: string; entries: DirEntry[] }
  | { ev: 'file_op_done'; kind: string; path: string; error?: string }
  | { ev: 'provider'; project: string; provider: ProviderName }
  | { ev: 'settings'; data: CockpitSettings; restartRequired?: boolean; telegramActive: boolean }
  | { ev: 'stt_result'; text?: string; error?: string } // solo al richiedente
  | { ev: 'mcp_op_done'; project: string; name: string; error?: string }
  | { ev: 'permission_mode'; project: string; mode: PermissionModeName } // cambio modalità lato engine (es. fine plan)
  | { ev: 'permission_resolved'; project: string; requestId: string } // richiesta decisa altrove/annullata: chiudere il prompt
  | { ev: 'context'; project: string; totalTokens: number; maxTokens: number; percentage: number; branch?: string }
  | { ev: 'error'; message: string; project?: string };
