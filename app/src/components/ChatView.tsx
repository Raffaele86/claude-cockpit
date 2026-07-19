import { useEffect, useRef, useState } from 'react';
import type { Item } from '../model';
import { renderMarkdown } from '../md';
import { copyText } from '../copy';
import { ToolCard } from './ToolCard';
import { t } from '../strings';
import { Icon } from './icons';

function CopyButton({ getText, label = t('copy') }: { getText: () => string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="copy-btn"
      onClick={async () => {
        if (await copyText(getText())) {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        }
      }}
    >
      {done ? <Icon name="check" size={11} /> : label}
    </button>
  );
}

function ThinkingChip({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const secs = Math.max(0, Math.round((Date.now() - since) / 1000));
  return <div className="thinking-chip"><Icon name="thought" size={12} /> {t('thinkingChip')(secs)}</div>;
}

export function ChatView({
  items,
  thinkingSince,
  onOpenFile,
}: {
  items: Item[];
  thinkingSince: number | null;
  onOpenFile: (path: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [items, thinkingSince]);

  // Inietta un pulsante "copia" su ogni blocco di codice renderizzato da marked.
  useEffect(() => {
    const root = chatRef.current;
    if (!root) return;
    root.querySelectorAll('pre').forEach((pre) => {
      if (pre.querySelector('.code-copy')) return;
      const btn = document.createElement('button');
      btn.className = 'code-copy';
      btn.textContent = t('copy');
      btn.onclick = () => {
        const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
        void copyText(code).then((ok) => {
          if (!ok) return;
          btn.textContent = '✓';
          setTimeout(() => (btn.textContent = t('copy')), 1200);
        });
      };
      pre.appendChild(btn);
    });
    // Rende cliccabili i path .md citati inline (`~/file.md`) → lettore Markdown integrato.
    root.querySelectorAll('.md code:not(pre code)').forEach((code) => {
      const txt = code.textContent ?? '';
      if (!/^[\w~./][\w~./ -]*\.md$/.test(txt) || code.classList.contains('md-link')) return;
      code.classList.add('md-link');
      (code as HTMLElement).title = t('openInReader');
      (code as HTMLElement).onclick = () => onOpenFile(txt);
    });
  }, [items, onOpenFile]);

  return (
    <div className="chat" ref={chatRef}>
      {items.length === 0 && <div className="empty">{t('writeToStart')}</div>}
      {items.map((it) => {
        if (it.kind === 'tool') return <ToolCard key={it.id} item={it} onOpenFile={onOpenFile} />;
        if (it.kind === 'thinking') {
          return (
            <details key={it.id} className="thinking-block">
              <summary><Icon name="thought" size={12} /> {t('thinkingBlock')(Math.round(it.text.length / 4))}</summary>
              <pre>{it.text}</pre>
            </details>
          );
        }
        if (it.kind === 'user') {
          // Come su claude.ai: card arrotondata senza etichetta.
          return (
            <div key={it.id} className="turn user">
              <div className="bubble">
                {it.text}
                {it.imageCount ? <span className="img-badge"> <Icon name="image" size={12} /> {it.imageCount}</span> : null}
              </div>
            </div>
          );
        }
        // Risposta: prosa serif direttamente sul fondo (niente bolla), marcatore ✳ e copia in hover.
        return (
          <div key={it.id} className="turn assistant">
            <span className="asst-mark"><Icon name="sparkle" size={13} /></span>
            <div className="asst-body md" dangerouslySetInnerHTML={{ __html: renderMarkdown(it.text || '…') }} />
            <CopyButton getText={() => it.text} />
          </div>
        );
      })}
      {thinkingSince !== null && <ThinkingChip since={thinkingSince} />}
      <div ref={endRef} />
    </div>
  );
}
