import { t, LOCALE } from '../strings';
import { FloatPanel } from './FloatPanel';
import { Icon } from './icons';
import type { TodomioTask } from '../protocol';

interface Props {
  todos: TodomioTask[] | null; // null = caricamento
  error?: string;
  onClose: () => void;
  onDone: (id: string) => void;
  onArchive: (id: string) => void;
  onRefresh: () => void;
}

function fmtDue(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' });
}

/** Azioni aperte da ToDoMio: completa/archivia senza lasciare il Cockpit. */
export function TodosPanel({ todos, error, onClose, onDone, onArchive, onRefresh }: Props) {
  const actions = (
    <button className="mini ghost btn-icon" title={t('todosRefresh')} onClick={onRefresh}>
      <Icon name="refresh" />
    </button>
  );

  return (
    <FloatPanel icon="check" title={t('todosTitle')} className="doctor usage-win" onClose={onClose} actions={actions}>
      <div className="doctor-body">
        {error && <p className="doc-note">{error}</p>}
        {!todos ? (
          <p className="doc-note">{t('todosLoading')}</p>
        ) : todos.length === 0 ? (
          !error && <p className="doc-note">{t('todosEmpty')}</p>
        ) : (
          <div className="usage-scroll">
            {todos.map((td) => (
              <div className="todos-row" key={td.id}>
                <div className="todos-main">
                  <div className="todos-title">{td.title}</div>
                  <div className="todos-badges">
                    {td.project && <span className="session-proj">{td.project}</span>}
                    {(td.priority === 'high' || td.priority === 'urgent') && (
                      <span className="todos-prio">{td.priority}</span>
                    )}
                    {td.dueAt && <span className="todos-due">{fmtDue(td.dueAt)}</span>}
                  </div>
                </div>
                <button
                  className="mini ghost btn-icon"
                  title={t('todosDoneTitle')}
                  onClick={() => {
                    if (window.confirm(t('todosDoneConfirm')(td.title))) onDone(td.id);
                  }}
                >
                  <Icon name="check" />
                </button>
                <button
                  className="mini ghost btn-icon"
                  title={t('todosArchiveTitle')}
                  onClick={() => {
                    if (window.confirm(t('todosArchiveConfirm')(td.title))) onArchive(td.id);
                  }}
                >
                  <Icon name="folder" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </FloatPanel>
  );
}
