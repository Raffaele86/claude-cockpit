import { randomUUID } from 'node:crypto';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  PermissionMode,
  PermissionResult,
  PermissionUpdate,
  Query,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { PermissionDecision, PromptImage } from './protocol.js';

const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;
// Default economico; fable/opus solo su scelta esplicita dalla UI (decisione 2026-07-03).
const DEFAULT_MODEL = 'claude-sonnet-5';

/** Coda di input per lo streaming-input mode di query(). */
class InputQueue implements AsyncIterable<SDKUserMessage> {
  private buffer: SDKUserMessage[] = [];
  private wake: (() => void) | null = null;
  private closed = false;

  push(msg: SDKUserMessage): void {
    this.buffer.push(msg);
    this.wake?.();
    this.wake = null;
  }

  close(): void {
    this.closed = true;
    this.wake?.();
    this.wake = null;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    while (true) {
      while (this.buffer.length > 0) yield this.buffer.shift()!;
      if (this.closed) return;
      await new Promise<void>((resolve) => (this.wake = resolve));
    }
  }
}

export interface SessionEmit {
  message: (msg: SDKMessage) => void;
  permissionRequest: (req: {
    requestId: string;
    toolName: string;
    input: Record<string, unknown>;
    suggestions?: PermissionUpdate[];
  }) => void;
  closed: (error?: unknown) => void;
}

interface PendingPermission {
  resolve: (result: PermissionResult) => void;
  suggestions?: PermissionUpdate[];
  timer: NodeJS.Timeout;
}

/** Una sessione Claude viva per progetto: query() con input streaming + permessi via UI. */
export class CockpitSession {
  sessionId: string | null = null;
  readonly usedResume: boolean;
  private readonly input = new InputQueue();
  private readonly q: Query;
  private readonly pending = new Map<string, PendingPermission>();

  constructor(
    readonly cwd: string,
    private readonly emit: SessionEmit,
    opts: { model?: string; permissionMode?: PermissionMode; resume?: string; env?: Record<string, string | undefined> } = {},
  ) {
    this.usedResume = Boolean(opts.resume);
    this.q = query({
      prompt: this.input,
      options: {
        cwd,
        model: opts.model ?? DEFAULT_MODEL,
        permissionMode: opts.permissionMode ?? 'default',
        resume: opts.resume,
        // Provider alternativi (es. GLM via CLAUDE_CONFIG_DIR): env di spawn del processo claude.
        env: opts.env,
        // Parità col CLI: senza questi espliciti l'SDK NON carica CLAUDE.md/hook/MCP
        // e usa un system prompt vuoto (default verificati su sdk.d.ts 0.3.199).
        settingSources: ['user', 'project', 'local'],
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        tools: { type: 'preset', preset: 'claude_code' },
        includePartialMessages: true,
        canUseTool: (toolName, input, { signal, suggestions }) =>
          this.requestPermission(toolName, input, signal, suggestions),
        stderr: (data) => console.error(`[claude:${cwd}]`, data.trimEnd()),
      },
    });
    void this.run();
  }

  private async run(): Promise<void> {
    try {
      for await (const msg of this.q) {
        if (msg.type === 'system' && msg.subtype === 'init') {
          this.sessionId = msg.session_id;
        }
        this.emit.message(msg);
      }
      this.emit.closed();
    } catch (err) {
      this.emit.closed(err);
    }
  }

  prompt(text: string, images?: PromptImage[]): void {
    const content: Array<Record<string, unknown>> = (images ?? []).map((img) => ({
      type: 'image',
      source: { type: 'base64', media_type: img.media_type, data: img.data },
    }));
    content.push({ type: 'text', text });
    this.input.push({
      type: 'user',
      message: { role: 'user', content: content as never },
      parent_tool_use_id: null,
    });
  }

  async interrupt(): Promise<void> {
    await this.q.interrupt();
  }

  async setPermissionMode(mode: PermissionMode): Promise<void> {
    await this.q.setPermissionMode(mode);
  }

  async setModel(model: string): Promise<void> {
    await this.q.setModel(model);
  }

  async setEffort(effort: 'low' | 'medium' | 'high' | 'xhigh'): Promise<void> {
    await this.q.applyFlagSettings({ effortLevel: effort });
  }

  async models(): Promise<{ model: string; displayName?: string }[]> {
    const list = await this.q.supportedModels();
    return list.map((m) => ({ model: m.value, displayName: m.displayName }));
  }

  async mcpStatus(): Promise<{ name: string; status: string }[]> {
    const list = await this.q.mcpServerStatus();
    return list.map((s) => ({ name: s.name, status: s.status }));
  }

  private requestPermission(
    toolName: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
    suggestions?: PermissionUpdate[],
  ): Promise<PermissionResult> {
    return new Promise<PermissionResult>((resolve) => {
      const requestId = randomUUID();
      const timer = setTimeout(
        () =>
          this.finishPermission(requestId, {
            behavior: 'deny',
            message: 'Nessuna decisione dalla UI entro 5 minuti',
          }),
        PERMISSION_TIMEOUT_MS,
      );
      this.pending.set(requestId, { resolve, suggestions, timer });
      signal.addEventListener('abort', () =>
        this.finishPermission(requestId, { behavior: 'deny', message: 'Operazione annullata' }),
      );
      this.emit.permissionRequest({ requestId, toolName, input, suggestions });
    });
  }

  private finishPermission(requestId: string, result: PermissionResult): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    this.pending.delete(requestId);
    clearTimeout(entry.timer);
    entry.resolve(result);
  }

  /** Applica la decisione arrivata dalla UI. Ritorna false se la richiesta non è più pendente. */
  decidePermission(
    requestId: string,
    decision: PermissionDecision,
    updatedInput?: Record<string, unknown>,
  ): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    let result: PermissionResult;
    switch (decision) {
      case 'allow-once':
        result = { behavior: 'allow' };
        break;
      case 'allow-always':
        result = { behavior: 'allow', updatedPermissions: entry.suggestions };
        break;
      case 'edit':
        result = { behavior: 'allow', updatedInput };
        break;
      case 'deny':
        result = { behavior: 'deny', message: 'Negato dalla UI Cockpit' };
        break;
    }
    this.finishPermission(requestId, result);
    return true;
  }

  close(): void {
    this.input.close();
    this.q.close();
  }
}
