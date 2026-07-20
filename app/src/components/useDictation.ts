import { useCallback, useEffect, useRef, useState } from 'react';
import type { CockpitClient } from '../ws';
import { t } from '../strings';

export type MicState = 'idle' | 'recording' | 'busy';

const MAX_RECORD_MS = 60_000;
const STT_RESPONSE_TIMEOUT_MS = 60_000;

/**
 * Dettatura universale: MediaRecorder → op `stt` (Whisper server-side via engine).
 * Funziona in Electron e su https; niente Web Speech (rotto fuori da Chrome+Google).
 */
export function useDictation(getClient: () => CockpitClient | null, onText: (text: string) => void) {
  const [state, setState] = useState<MicState>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const sttTimeoutRef = useRef<number | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  // Non lasciare il timeout di attesa stt_result orfano se il componente smonta a metà.
  useEffect(() => {
    return () => {
      if (sttTimeoutRef.current) clearTimeout(sttTimeoutRef.current);
    };
  }, []);

  const toggle = useCallback(async () => {
    setMsg(null);
    if (state === 'recording') {
      recRef.current?.stop();
      return;
    }
    if (state === 'busy') return;
    // getUserMedia esiste solo in secure context (https/Electron): su http il messaggio spiega.
    if (!navigator.mediaDevices?.getUserMedia) {
      setMsg(t('micNeedsHttps'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (timerRef.current) clearTimeout(timerRef.current);
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        if (blob.size < 1200) {
          setState('idle'); // tap accidentale: niente audio utile
          return;
        }
        setState('busy');
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result);
          const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
          const client = getClient();
          if (!client) {
            setState('idle');
            return;
          }
          const unsub = client.subscribe((m) => {
            if (m.ev !== 'stt_result') return;
            if (sttTimeoutRef.current) {
              clearTimeout(sttTimeoutRef.current);
              sttTimeoutRef.current = null;
            }
            unsub();
            setState('idle');
            if (m.error) setMsg(m.error);
            else if (m.text) onTextRef.current(m.text);
          });
          client.send({ op: 'stt', audio: b64, mime: blob.type });
          // Nessun timeout sulla fetch server→provider visto dal client: se stt_result non
          // arriva mai (rete caduta, provider muto), il mic resterebbe a spinner per sempre.
          sttTimeoutRef.current = window.setTimeout(() => {
            sttTimeoutRef.current = null;
            unsub();
            setState('idle');
            setMsg(t('micError')('timeout'));
          }, STT_RESPONSE_TIMEOUT_MS);
        };
        reader.readAsDataURL(blob);
      };
      recRef.current = rec;
      rec.start();
      setState('recording');
      timerRef.current = window.setTimeout(() => {
        if (rec.state === 'recording') rec.stop();
      }, MAX_RECORD_MS);
    } catch (err) {
      const name = (err as Error).name ?? '';
      setMsg(name === 'NotAllowedError' ? t('micDenied') : t('micError')(name || String(err)));
    }
  }, [state, getClient]);

  return { state, msg, setMsg, toggle };
}
