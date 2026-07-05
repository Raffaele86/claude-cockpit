import { useMemo, useState } from 'react';
import type { SearchResult, SessionCategory, SessionSummary } from '../protocol';
import { t, LOCALE } from '../strings';

function relTime(ms: number): string {
  const d = Date.now() - ms;
  const min = Math.round(d / 60_000);
  if (min < 60) return t('minAgo')(Math.max(1, min));
  const h = Math.round(min / 60);
  if (h < 24) return t('hoursAgo')(h);
  const g = Math.round(h / 24);
  if (g < 30) return t('daysAgo')(g);
  return new Date(ms).toLocaleDateString(LOCALE);
}

const CATEGORIES: { key: SessionCategory; label: string }[] = [
  { key: 'cockpit', label: t('catCockpit') },
  { key: 'cli', label: t('terminal') },
  { key: 'scheduler', label: t('catScheduler') },
  { key: 'tech', label: t('catTech') },
];

interface Props {
  sessions: SessionSummary[];
  searchResults: SearchResult[] | null;
  currentId?: string;
  onSearch: (query: string) => void;
  onOpen: (sessionId: string) => void;
  onClose: () => void;
}

export function SessionPicker({ sessions, searchResults, currentId, onSearch, onOpen, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [deep, setDeep] = useState(false); // true = mostra i risultati full-text
  const [enabled, setEnabled] = useState<Set<SessionCategory>>(new Set(['cockpit', 'cli']));

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions.filter((s) => enabled.has(s.category) && (!q || s.summary.toLowerCase().includes(q)));
  }, [sessions, enabled, query]);

  function toggle(cat: SessionCategory) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  const hidden = sessions.length - visible.length;

  return (
    <div className="session-picker">
      <div className="session-picker-bar">
        <span>{t('chatHistory')}</span>
        <button onClick={onClose}>✕</button>
      </div>
      <div className="session-filters">
        <div className="session-search-row">
          <input
            type="search"
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (deep) {
                setDeep(false);
                onSearch('');
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim()) {
                setDeep(true);
                onSearch(query.trim());
              }
            }}
          />
          <button
            className="cat"
            title={t('inContentsTitle')}
            disabled={!query.trim()}
            onClick={() => {
              setDeep(true);
              onSearch(query.trim());
            }}
          >
            {t('inContents')}
          </button>
        </div>
        <div className="session-cats">
          {CATEGORIES.map((c) => (
            <button key={c.key} className={enabled.has(c.key) ? 'cat on' : 'cat'} onClick={() => toggle(c.key)}>
              {c.label}
            </button>
          ))}
          {hidden > 0 && <span className="session-hidden">{t('hiddenCount')(hidden)}</span>}
        </div>
      </div>
      {deep && searchResults === null && <div className="session-empty">{t('searching')}</div>}
      {deep && searchResults !== null && searchResults.length === 0 && (
        <div className="session-empty">{t('noContentFor')(query)}</div>
      )}
      {!deep && visible.length === 0 && <div className="session-empty">{t('noSessions')}</div>}
      <div className="session-list">
        {(deep ? (searchResults ?? []) : visible).map((s) => (
          <button
            key={s.sessionId}
            className={s.sessionId === currentId ? 'session-item current' : 'session-item'}
            onClick={() => onOpen(s.sessionId)}
            title={s.summary}
          >
            <span className={`session-cat-dot ${s.category}`} />
            <span className="session-body">
              <span className="session-title">{s.summary}</span>
              {'snippet' in s && <span className="session-snippet">…{(s as SearchResult).snippet}…</span>}
            </span>
            <span className="session-when">{relTime(s.lastModified)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
