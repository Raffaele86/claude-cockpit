import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { t } from '../strings';
import type { CockpitClient } from '../ws';
import { useDictation } from './useDictation';

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

export function Composer({ disabled, busy, queued, slashCommands, client, onSend, onInterrupt, insertRef }: Props) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
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
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData?.items ?? [])
      .filter((it) => it.kind === 'file' && IMAGE_TYPES.has(it.type))
      .map((it) => it.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length === 0) return;
    e.preventDefault();
    for (const f of files) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result); // "data:image/png;base64,...."
        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        setImages((prev) => [...prev, { media_type: f.type as ImageAttachment['media_type'], data: base64 }]);
      };
      reader.readAsDataURL(f);
    }
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
    <div className="composer-wrap">
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
          <button onClick={() => mic.setMsg(null)}>✕</button>
        </div>
      )}
      {(images.length > 0 || queued > 0) && (
        <div className="composer-chips">
          {images.map((img, i) => (
            <span key={i} className="img-chip">
              🖼 {img.media_type.replace('image/', '')}
              <button onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}>✕</button>
            </span>
          ))}
          {queued > 0 && <span className="queue-chip">{t('queuedChip')(queued)}</span>}
        </div>
      )}
      <div className="composer">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onPaste={onPaste}
          placeholder={disabled ? t('placeholderWaiting') : busy ? t('placeholderBusy') : t('placeholderIdle')}
          disabled={disabled}
          rows={3}
        />
        <div className="composer-actions">
          <button
            className={mic.state === 'recording' ? 'mic on' : 'mic'}
            title={mic.state === 'busy' ? t('micTranscribing') : t('dictateTitle')}
            onClick={() => void mic.toggle()}
          >
            {mic.state === 'recording' ? '🔴' : mic.state === 'busy' ? '…' : '🎤'}
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
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
