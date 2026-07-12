import { useState } from 'react';
import type { Item } from '../model';
import { DiffView } from './DiffView';
import { Icon } from './icons';

type ToolItem = Extract<Item, { kind: 'tool' }>;

function summary(name: string, input: Record<string, unknown>): string {
  if (typeof input.file_path === 'string') return input.file_path;
  if (typeof input.command === 'string') return input.command;
  if (typeof input.pattern === 'string') return input.pattern;
  if (typeof input.path === 'string') return input.path;
  if (typeof input.url === 'string') return input.url;
  return name;
}

function diffBlocks(name: string, input: Record<string, unknown>): { header?: string; oldText: string; newText: string }[] {
  if (name === 'Edit') {
    return [{ oldText: String(input.old_string ?? ''), newText: String(input.new_string ?? '') }];
  }
  if (name === 'Write') {
    return [{ oldText: '', newText: String(input.content ?? '') }];
  }
  if (name === 'MultiEdit' && Array.isArray(input.edits)) {
    return (input.edits as Array<Record<string, unknown>>).map((e, i) => ({
      header: `edit ${i + 1}`,
      oldText: String(e.old_string ?? ''),
      newText: String(e.new_string ?? ''),
    }));
  }
  return [];
}

export function ToolCard({ item, onOpenFile }: { item: ToolItem; onOpenFile?: (path: string) => void }) {
  const [open, setOpen] = useState(item.status !== 'done');
  const diffs = diffBlocks(item.name, item.input);
  const isDiff = diffs.length > 0;
  const filePath = typeof item.input.file_path === 'string' ? item.input.file_path : typeof item.input.path === 'string' ? item.input.path : null;
  const mdPath = filePath?.endsWith('.md') ? filePath : null;

  return (
    <div className={`tool-card ${item.status}`}>
      <button className="tool-head" onClick={() => setOpen((o) => !o)}>
        <span className={`tstatus ${item.status}`} />
        <span className="tname">{item.name}</span>
        <span className="tsummary">{summary(item.name, item.input)}</span>
        {mdPath && onOpenFile && (
          <span
            className="md-open-btn"
            title="Apri nel lettore Markdown"
            onClick={(e) => {
              e.stopPropagation();
              onOpenFile(mdPath);
            }}
          >
            <Icon name="book" size={13} />
          </span>
        )}
        <span className="tchevron"><Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} /></span>
      </button>
      {open && (
        <div className="tool-body">
          {isDiff ? (
            diffs.map((d, i) => (
              <div key={i} className="diff-block">
                {d.header && <div className="diff-header">{d.header}</div>}
                <DiffView oldText={d.oldText} newText={d.newText} />
              </div>
            ))
          ) : (
            <pre className="tool-input">{JSON.stringify(item.input, null, 2)}</pre>
          )}
          {item.result !== undefined && item.result !== '' && (
            <pre className={`tool-result ${item.status}`}>{item.result.slice(0, 4000)}</pre>
          )}
        </div>
      )}
    </div>
  );
}
