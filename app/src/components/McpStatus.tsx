import { useEffect, useState } from 'react';
import type { McpServer } from '../model';
import type { McpAddRequest } from '../protocol';
import { t } from '../strings';

const COLOR: Record<string, string> = {
  connected: 'var(--green)',
  failed: 'var(--red)',
  'needs-auth': 'var(--amber)',
  pending: 'var(--text-dim)',
  disabled: 'var(--text-dim)',
};

interface Props {
  servers: McpServer[];
  op: { busy: boolean; error: string | null };
  onRefresh: () => void;
  onAdd: (server: McpAddRequest) => void;
  onRemove: (name: string) => void;
}

const EMPTY_FORM = { name: '', transport: 'http' as McpAddRequest['transport'], target: '', headers: '', env: '', scope: 'user' as McpAddRequest['scope'] };

export function McpStatus({ servers, op, onRefresh, onAdd, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmRm, setConfirmRm] = useState<string | null>(null);

  // Operazione conclusa senza errore → chiudi e svuota il form.
  useEffect(() => {
    if (!op.busy && !op.error) {
      setAdding(false);
      setForm(EMPTY_FORM);
      setConfirmRm(null);
    }
  }, [op.busy, op.error]);

  const down = servers.filter((s) => s.status !== 'connected').length;
  const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);

  return (
    <div className="mcp-panel">
      <div className="mcp-head">
        <button className="mcp-toggle" onClick={() => setOpen((o) => !o)}>
          <span className="mcp-title">MCP</span>
          <span className="mcp-summary" style={{ color: down > 0 ? 'var(--amber)' : 'var(--green)' }}>
            {servers.length === 0 ? '—' : down > 0 ? t('mcpDown')(down) : t('mcpOk')(servers.length)}
          </span>
          <span className="tchevron">{open ? '▾' : '▸'}</span>
        </button>
        <button className="mcp-refresh" title={t('refresh')} onClick={onRefresh}>
          ↻
        </button>
        <button className="mcp-refresh" title={t('mcpAddTitle')} onClick={() => { setOpen(true); setAdding((a) => !a); }}>
          ＋
        </button>
      </div>
      {open && servers.length === 0 && !adding && <div className="mcp-empty">{t('mcpEmpty')}</div>}
      {open &&
        servers.map((s) => (
          <div key={s.name} className="mcp-item" title={s.status}>
            <span className="mcp-dot" style={{ background: COLOR[s.status] ?? 'var(--text-dim)' }} />
            <span className="mcp-name">{s.name}</span>
            {confirmRm === s.name ? (
              <>
                <button className="mcp-rm danger" disabled={op.busy} onClick={() => onRemove(s.name)}>
                  {op.busy ? '…' : t('mcpConfirmRemove')}
                </button>
                <button className="mcp-rm" onClick={() => setConfirmRm(null)}>✕</button>
              </>
            ) : (
              <button className="mcp-rm" title={t('mcpRemoveTitle')} onClick={() => setConfirmRm(s.name)}>
                ×
              </button>
            )}
          </div>
        ))}
      {open && adding && (
        <div className="mcp-add-form">
          <input placeholder={t('mcpName')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select value={form.transport} onChange={(e) => setForm({ ...form, transport: e.target.value as McpAddRequest['transport'] })}>
            <option value="http">HTTP</option>
            <option value="sse">SSE</option>
            <option value="stdio">stdio</option>
          </select>
          <input
            placeholder={form.transport === 'stdio' ? t('mcpTargetCmd') : t('mcpTargetUrl')}
            value={form.target}
            onChange={(e) => setForm({ ...form, target: e.target.value })}
          />
          {form.transport !== 'stdio' ? (
            <textarea rows={2} placeholder={t('mcpHeaders')} value={form.headers} onChange={(e) => setForm({ ...form, headers: e.target.value })} />
          ) : (
            <textarea rows={2} placeholder={t('mcpEnv')} value={form.env} onChange={(e) => setForm({ ...form, env: e.target.value })} />
          )}
          <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as McpAddRequest['scope'] })}>
            <option value="user">{t('mcpScopeAll')}</option>
            <option value="project">{t('mcpScopeProject')}</option>
          </select>
          {op.error && <div className="mcp-error">{op.error}</div>}
          <div className="mcp-add-actions">
            <button
              disabled={op.busy || !form.name.trim() || !form.target.trim()}
              onClick={() =>
                onAdd({
                  name: form.name.trim(),
                  transport: form.transport,
                  target: form.target,
                  headers: lines(form.headers),
                  env: lines(form.env),
                  scope: form.scope,
                })
              }
            >
              {op.busy ? t('mcpAdding') : t('add')}
            </button>
            <button onClick={() => setAdding(false)}>{t('cancel')}</button>
          </div>
          <div className="mcp-note">{t('mcpRestartNote')}</div>
        </div>
      )}
    </div>
  );
}
