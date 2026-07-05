import { lineDiff } from '../diff';

export function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const rows = lineDiff(oldText, newText);
  return (
    <pre className="diff">
      {rows.map((r, i) => (
        <div key={i} className={`diff-row ${r.type}`}>
          <span className="gutter">{r.type === 'add' ? '+' : r.type === 'del' ? '-' : ' '}</span>
          <span className="line">{r.text || ' '}</span>
        </div>
      ))}
    </pre>
  );
}
