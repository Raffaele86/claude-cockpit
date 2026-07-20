import { useRef, useState } from 'react';
import { Icon } from './icons';
import { t } from '../strings';

/**
 * Schermata di accesso da browser.
 *
 * Prima era un `prompt()` nativo (browser-shim.ts): la PRIMA cosa che il
 * Cockpit mostrava dal telefono era una finestrella di sistema, non
 * disegnabile, non riempibile in anticipo, senza modo di spiegare da dove si
 * prende il token ne' di dire che quello inserito era sbagliato.
 *
 * Serve anche quando un token c'e' ma l'engine lo rifiuta: l'engine non manda
 * nessun evento di rifiuto, chiude e basta, e prima il client riprovava per
 * sempre lasciando l'utente davanti a un pallino che non diventava mai verde.
 */
export function AuthGate({ rejected, onToken }: { rejected: boolean; onToken: (token: string) => void }) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (v) onToken(v);
  };

  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) {
        setValue(text);
        ref.current?.focus();
      }
    } catch {
      /* senza permesso appunti si incolla a mano: niente da segnalare */
    }
  };

  return (
    <div className="authgate">
      <form className="authgate-card" onSubmit={submit}>
        <div className="authgate-mark" aria-hidden="true">
          <Icon name="terminal" size={22} />
        </div>
        <h1 className="authgate-title">Claude Cockpit</h1>
        <p className="authgate-hint">{t('authHint')}</p>

        {rejected && (
          <p className="authgate-err" role="alert">
            {t('authRejected')}
          </p>
        )}

        <input
          ref={ref}
          className="authgate-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('authPlaceholder')}
          aria-label={t('authPlaceholder')}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />

        <div className="authgate-actions">
          <button type="button" className="mini ghost" onClick={paste}>
            <Icon name="clipboard" size={13} /> {t('authPaste')}
          </button>
          <button type="submit" className="mini primary" disabled={!value.trim()}>
            {t('authEnter')}
          </button>
        </div>

        <p className="authgate-note">{t('authWhere')}</p>
      </form>
    </div>
  );
}
