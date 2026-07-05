import { useState } from 'react';
import type { McpServer } from '../model';
import { t } from '../strings';

const COLOR: Record<string, string> = {
  connected: 'var(--green)',
  failed: 'var(--red)',
  'needs-auth': 'var(--amber)',
  pending: 'var(--text-dim)',
  disabled: 'var(--text-dim)',
};

export function McpStatus({ servers, onRefresh }: { servers: McpServer[]; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  if (servers.length === 0) return null;
  const down = servers.filter((s) => s.status !== 'connected').length;
  return (
    <div className="mcp-panel">
      <div className="mcp-head">
        <button className="mcp-toggle" onClick={() => setOpen((o) => !o)}>
          <span className="mcp-title">MCP</span>
          <span className="mcp-summary" style={{ color: down > 0 ? 'var(--amber)' : 'var(--green)' }}>
            {down > 0 ? t('mcpDown')(down) : t('mcpOk')(servers.length)}
          </span>
          <span className="tchevron">{open ? '▾' : '▸'}</span>
        </button>
        <button className="mcp-refresh" title={t('refresh')} onClick={onRefresh}>
          ↻
        </button>
      </div>
      {open &&
        servers.map((s) => (
          <div key={s.name} className="mcp-item" title={s.status}>
            <span className="mcp-dot" style={{ background: COLOR[s.status] ?? 'var(--text-dim)' }} />
            <span className="mcp-name">{s.name}</span>
          </div>
        ))}
    </div>
  );
}
