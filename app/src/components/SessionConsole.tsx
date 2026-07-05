import { useEffect, useRef } from 'react';
import type { Item } from '../model';
import { t } from '../strings';

/** Riassunto compatto dell'input di un tool (stessa logica della ToolCard). */
function toolLine(name: string, input: Record<string, unknown>): string {
  const v = input.file_path ?? input.command ?? input.pattern ?? input.path ?? input.url ?? '';
  return `${name} ${String(v)}`.trim();
}

/**
 * Console live della sessione attiva: la stessa timeline della chat resa come
 * feed monospace stile terminale (prompt, tool con input, esiti, testi).
 */
export function SessionConsole({ items, sessionId, model }: { items: Item[]; sessionId?: string; model: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [items]);

  return (
    <div className="console">
      <div className="con-line con-meta">
        # {t('sessionConsole')} · {model || '…'} {sessionId ? `· ${sessionId.slice(0, 8)}` : ''}
      </div>
      {items.map((it) => {
        if (it.kind === 'user')
          return (
            <div key={it.id} className="con-line con-user">
              ❯ {it.text}
            </div>
          );
        if (it.kind === 'thinking')
          return (
            <div key={it.id} className="con-line con-think">
              💭 {it.text.replace(/\s+/g, ' ').slice(0, 200)}
            </div>
          );
        if (it.kind === 'tool')
          return (
            <div key={it.id} className={`con-line con-tool ${it.status}`}>
              <span className="con-mark">{it.status === 'running' ? '⚙' : it.status === 'error' ? '✗' : '✓'}</span>{' '}
              {toolLine(it.name, it.input)}
              {it.result ? <span className="con-dim"> → {it.result.replace(/\s+/g, ' ').slice(0, 160)}</span> : null}
            </div>
          );
        return it.text ? (
          <div key={it.id} className="con-line con-asst">
            {it.text}
          </div>
        ) : null;
      })}
      <div ref={endRef} />
    </div>
  );
}
