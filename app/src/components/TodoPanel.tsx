import type { Todo } from '../model';

const ICON: Record<string, string> = {
  completed: '✓',
  in_progress: '▸',
  pending: '○',
};

export function TodoPanel({ todos }: { todos: Todo[] }) {
  if (todos.length === 0) return null;
  return (
    <div className="todo-panel">
      <div className="todo-title">Todo</div>
      {todos.map((t, i) => (
        <div key={i} className={`todo-item ${t.status}`}>
          <span className="todo-icon">{ICON[t.status] ?? '·'}</span>
          <span className="todo-text">{t.status === 'in_progress' ? (t.activeForm ?? t.content) : t.content}</span>
        </div>
      ))}
    </div>
  );
}
