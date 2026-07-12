import { useState } from 'react';
import { marked } from 'marked';
import { t } from '../strings';
import { useDragWin } from './useDragWin';
import { Icon } from './icons';

export interface ViewerState {
  path: string;
  content?: string;
  error?: string;
}

/** Markdown → testo piano pulito, pronto da incollare ovunque (niente #, **, backtick, pipe). */
export function mdToPlain(md: string): string {
  let t = md.replace(/\r\n/g, '\n');
  t = t.replace(/^---\n[\s\S]*?\n---\n/, ''); // frontmatter YAML
  t = t.replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code: string) => code.trimEnd()); // fence via, codice resta
  t = t.replace(/^#{1,6}\s+(.*)$/gm, (_, h: string) => h.toUpperCase()); // titoli → MAIUSCOLO
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1'); // immagini → alt
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, txt: string, url: string) => (txt === url ? url : `${txt} (${url})`));
  // bold/italic — gli underscore DENTRO le parole (es. nomi_file) non sono corsivo e restano
  t = t.replace(/(\*\*|__)(.*?)\1/g, '$2');
  t = t.replace(/\*(?=\S)([^*\n]*?\S)\*/g, '$1');
  t = t.replace(/(?<![\w])_(?=\S)([^_\n]*?\S)_(?![\w])/g, '$1');
  t = t.replace(/`([^`]+)`/g, '$1'); // inline code
  t = t.replace(/^\s*>\s?/gm, ''); // citazioni
  t = t.replace(/^[ \t]*[-*+]\s+/gm, '- '); // bullet normalizzati
  // Tabelle: via i separatori |---|, le righe diventano "a — b — c"
  t = t.replace(/^\|?[\s:|-]+\|[\s:|-]+$/gm, '');
  t = t.replace(/^\|(.+)\|$/gm, (_, row: string) =>
    row
      .split('|')
      .map((c: string) => c.trim())
      .filter(Boolean)
      .join(' — '),
  );
  t = t.replace(/^[-*_]{3,}$/gm, ''); // hr
  t = t.replace(/\n{3,}/g, '\n\n'); // max una riga vuota
  return t.trim();
}

export function MdViewer({ viewer, onClose }: { viewer: ViewerState; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const { ref, style, onBarMouseDown } = useDragWin();
  const name = viewer.path.split('/').filter(Boolean).at(-1) ?? viewer.path;

  async function copy(kind: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      /* clipboard non disponibile */
    }
  }

  return (
    <div className="md-viewer float-win" ref={ref} style={style}>
      <div className="md-viewer-bar" onMouseDown={onBarMouseDown}>
        <span className="md-viewer-title" title={viewer.path}>
          <Icon name="book" /> {name}
        </span>
        {viewer.content !== undefined && (
          <>
            <button title={t('copyTextTitle')} onClick={() => copy('txt', mdToPlain(viewer.content!))}>
              {copied === 'txt' ? <Icon name="check" size={12} /> : t('copyText')}
            </button>
            <button title={t('copyMdTitle')} onClick={() => copy('md', viewer.content!)}>
              {copied === 'md' ? <Icon name="check" size={12} /> : t('copyMd')}
            </button>
          </>
        )}
        <button onClick={() => copy('path', viewer.path)}>{copied === 'path' ? <Icon name="check" size={12} /> : t('copyPath')}</button>
        <button onClick={onClose}><Icon name="close" /></button>
      </div>
      <div className="md-viewer-body">
        {viewer.error && <div className="md-viewer-error">{t('cannotOpen')(viewer.error)}</div>}
        {viewer.content !== undefined && (
          <div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(viewer.content) as string }} />
        )}
        {viewer.content === undefined && !viewer.error && <div className="md-viewer-loading">{t('loading')}</div>}
      </div>
    </div>
  );
}
