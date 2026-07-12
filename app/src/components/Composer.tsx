import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { t } from '../strings';
import type { CockpitClient } from '../ws';
import { useDictation } from './useDictation';
import { Icon } from './icons';

type ImageAttachment = { media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'; data: string };

interface Props {
  disabled: boolean;
  busy: boolean;
  queued: number;
  slashCommands: string[];
  client: CockpitClient | null; // per la dettatura (op stt)
  onSend: (text: string, images?: ImageAttachment[]) => void;
  onInterrupt: () => void;
  insertRef?: React.MutableRefObject<((text: string) => void) | null>; // es. "Chiedi a Claude" dal navigator
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const TEXT_EXTS = new Set(['md', 'txt', 'log', 'json', 'csv', 'yml', 'yaml']);
const TEXT_FILE_CAP = 100 * 1024; // oltre: rifiutato con messaggio
const DROP_FILES_CAP = 5;

export function Composer({ disabled, busy, queued, slashCommands, client, onSend, onInterrupt, insertRef }: Props) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [dropMsg, setDropMsg] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const clientRef = useRef(client);
  clientRef.current = client;
  // Dettatura Whisper server-side: registra → engine trascrive → testo nel composer.
  const mic = useDictation(
    () => clientRef.current,
    (spoken) => {
      setText((prev) => (prev ? `${prev} ${spoken}` : spoken));
      ref.current?.focus();
    },
  );

  useEffect(() => {
    if (!insertRef) return;
    insertRef.current = (t: string) => {
      setText((prev) => (prev ? `${prev} ${t}` : t));
      ref.current?.focus();
    };
    return () => {
      insertRef.current = null;
    };
  }, [insertRef]);

  // Palette slash: attiva quando il testo è "/qualcosa" senza spazi.
  const matches = useMemo(() => {
    if (!text.startsWith('/') || text.includes(' ') || text.includes('\n')) return [];
    const q = text.slice(1).toLowerCase();
    return slashCommands.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [text, slashCommands]);

  function submit() {
    if (!text.trim()) return;
    onSend(text, images.length > 0 ? images : undefined);
    setText('');
    setImages([]);
    if (ref.current) ref.current.style.height = 'auto'; // torna a 1 riga
  }

  // Condiviso da incolla e drag&drop: immagini → allegati; file di testo → blocco citato nel testo.
  function addFiles(files: File[]): void {
    for (const f of files.slice(0, DROP_FILES_CAP)) {
      if (IMAGE_TYPES.has(f.type)) {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result); // "data:image/png;base64,...."
          const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
          setImages((prev) => [...prev, { media_type: f.type as ImageAttachment['media_type'], data: base64 }]);
        };
        reader.readAsDataURL(f);
      } else if (f.type.startsWith('text/') || TEXT_EXTS.has(f.name.split('.').at(-1)?.toLowerCase() ?? '')) {
        if (f.size > TEXT_FILE_CAP) {
          setDropMsg(t('dropTooBig')(f.name));
          continue;
        }
        const reader = new FileReader();
        reader.onload = () => {
          setText((prev) => `${prev}${prev ? '\n\n' : ''}[${f.name}]\n\`\`\`\n${String(reader.result)}\n\`\`\`\n`);
        };
        reader.readAsText(f);
      } else {
        setDropMsg(t('dropUnsupported')(f.name));
      }
    }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData?.items ?? [])
      .filter((it) => it.kind === 'file' && IMAGE_TYPES.has(it.type))
      .map((it) => it.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length === 0) return;
    e.preventDefault();
    addFiles(files);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    addFiles(Array.from(e.dataTransfer?.files ?? []));
    ref.current?.focus();
  }

  function pick(cmd: string) {
    setText('/' + cmd + ' ');
    ref.current?.focus();
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (matches.length > 0 && e.key === 'Tab') {
      e.preventDefault();
      pick(matches[0]);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape' && busy) {
      e.preventDefault();
      onInterrupt();
    }
  }

  return (
    <div
      className={dragOver ? 'composer-wrap drop-hover' : 'composer-wrap'}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {matches.length > 0 && (
        <div className="slash-palette">
          {matches.map((c) => (
            <button key={c} className="slash-item" onClick={() => pick(c)}>
              /{c}
            </button>
          ))}
        </div>
      )}
      {mic.msg && (
        <div className="mic-msg">
          {mic.msg}
          <button onClick={() => mic.setMsg(null)}><Icon name="close" /></button>
        </div>
      )}
      {dropMsg && (
        <div className="mic-msg">
          {dropMsg}
          <button onClick={() => setDropMsg(null)}><Icon name="close" /></button>
        </div>
      )}
      {(images.length > 0 || queued > 0) && (
        <div className="composer-chips">
          {images.map((img, i) => (
            <span key={i} className="img-chip">
              <Icon name="image" /> {img.media_type.replace('image/', '')}
              <button onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}><Icon name="close" /></button>
            </span>
          ))}
          {queued > 0 && <span className="queue-chip">{t('queuedChip')(queued)}</span>}
        </div>
      )}
      <div className="composer">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            // auto-grow: 1 riga a riposo, cresce col contenuto fino a ~40vh
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
          }}
          onKeyDown={onKey}
          onPaste={onPaste}
          placeholder={disabled ? t('placeholderWaiting') : busy ? t('placeholderBusy') : t('placeholderIdle')}
          disabled={disabled}
          rows={1}
        />
        <div className="composer-actions">
          <button
            className={mic.state === 'recording' ? 'mic on' : 'mic'}
            title={mic.state === 'busy' ? t('micTranscribing') : t('dictateTitle')}
            onClick={() => void mic.toggle()}
          >
            {mic.state === 'recording' ? <Icon name="record" /> : mic.state === 'busy' ? <Icon name="spinner" className="spin" /> : <Icon name="mic" />}
          </button>
          {busy && (
            <button className="stop" onClick={onInterrupt}>
              {t('stopEsc')}
            </button>
          )}
          <button
            className="send"
            title={busy ? t('enqueue') : t('send')}
            onClick={submit}
            disabled={disabled || !text.trim()}
          >
            <Icon name="send" />
          </button>
        </div>
      </div>
    </div>
  );
}
