import type { Todo } from '../model';
import { Icon } from './icons';
import type { IconName } from './icons';

const ICON: Record<string, IconName> = {
  completed: 'check',
  in_progress: 'chevron-right',
  pending: 'circle',
};

export function TodoPanel({ todos }: { todos: Todo[] }) {
  if (todos.length === 0) return null;
  return (
    <div className="todo-panel">
      <div className="todo-title">Todo</div>
      {todos.map((t, i) => {
        const icon = ICON[t.status];
        return (
          <div key={i} className={`todo-item ${t.status}`}>
            <span className="todo-icon">{icon ? <Icon name={icon} size={12} /> : '·'}</span>
            <span className="todo-text">{t.status === 'in_progress' ? (t.activeForm ?? t.content) : t.content}</span>
          </div>
        );
      })}
    </div>
  );
}
