import { useEffect, useState } from 'react';
import type { CockpitSettings, QuickActionEntry } from '../protocol';
import { t } from '../strings';
import { useDragWin } from './useDragWin';

export interface SettingsSnapshot {
  data: CockpitSettings;
  restartRequired?: boolean;
  telegramActive: boolean;
}

interface Props {
  snapshot: SettingsSnapshot | null; // null = in caricamento (settings_get inviata)
  engineVersion: string;
  home: string;
  onSave: (patch: Partial<CockpitSettings>) => void;
  onClose: () => void;
}

interface NotifyCfg {
  notify: boolean;
  notifyPhone: boolean;
  ntfyTopic: string;
}

const IS_ELECTRON = navigator.userAgent.includes('Electron');

export function Settings({ snapshot, engineVersion, home, onSave, onClose }: Props) {
  // Stato editabile, inizializzato quando arriva lo snapshot dall'engine.
  const [tg, setTg] = useState<CockpitSettings['telegram']>({});
  const [glm, setGlm] = useState<{ configDir: string; model: string }>({ configDir: '', model: '' });
  const [hosts, setHosts] = useState('');
  const [qa, setQa] = useState<QuickActionEntry[]>([]);
  const [notifyCfg, setNotifyCfg] = useState<NotifyCfg | null>(null);
  const [lang, setLang] = useState(() => localStorage.getItem('cockpit-lang') ?? '');
  const [savedFlash, setSavedFlash] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { ref, style, onBarMouseDown } = useDragWin();

  useEffect(() => {
    if (!snapshot || loaded) return;
    setTg(snapshot.data.telegram);
    setGlm({ configDir: snapshot.data.providers.glm?.configDir ?? '', model: snapshot.data.providers.glm?.model ?? '' });
    setHosts(snapshot.data.engine.hosts.join('\n'));
    setQa(snapshot.data.quickactions);
    setLoaded(true);
  }, [snapshot, loaded]);

  useEffect(() => {
    if (IS_ELECTRON) void window.cockpit.getConfig().then(setNotifyCfg);
  }, []);

  function save() {
    onSave({
      telegram: { ...tg, chatId: tg.chatId ? Number(tg.chatId) : undefined },
      providers: glm.configDir.trim() ? { glm: { configDir: glm.configDir, model: glm.model || undefined } } : {},
      engine: { hosts: hosts.split('\n').map((h) => h.trim()).filter(Boolean) },
      quickactions: qa,
    });
    if (IS_ELECTRON && notifyCfg) void window.cockpit.setConfig(notifyCfg);
    if (lang) localStorage.setItem('cockpit-lang', lang);
    else localStorage.removeItem('cockpit-lang');
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  return (
    <div className="md-viewer settings-modal float-win" ref={ref} style={style}>
      <div className="md-viewer-bar" onMouseDown={onBarMouseDown}>
          <span className="md-viewer-title">⚙️ {t('settingsTitle')}</span>
          {snapshot?.restartRequired && <span className="settings-warn">{t('restartRequired')}</span>}
          <button onClick={save}>{savedFlash ? t('saved') : t('save')}</button>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="md-viewer-body settings-body">
          {!loaded ? (
            <div className="md-viewer-loading">…</div>
          ) : (
            <>
              <section>
                <h3>{t('secNotify')}</h3>
                {IS_ELECTRON && notifyCfg ? (
                  <>
                    <label className="set-check">
                      <input
                        type="checkbox"
                        checked={notifyCfg.notify}
                        onChange={(e) => setNotifyCfg({ ...notifyCfg, notify: e.target.checked })}
                      />
                      {t('notifyDesktop')}
                    </label>
                    <label className="set-check">
                      <input
                        type="checkbox"
                        checked={notifyCfg.notifyPhone}
                        onChange={(e) => setNotifyCfg({ ...notifyCfg, notifyPhone: e.target.checked })}
                      />
                      {t('notifyPhoneLbl')}
                    </label>
                    <label className="set-field">
                      {t('ntfyTopicLbl')}
                      <input
                        value={notifyCfg.ntfyTopic}
                        onChange={(e) => setNotifyCfg({ ...notifyCfg, ntfyTopic: e.target.value })}
                        placeholder="my-secret-topic"
                      />
                    </label>
                    <p className="set-hint">{t('ntfyTopicHint')}</p>
                  </>
                ) : (
                  <p className="set-hint">{t('notifyBrowserOnly')}</p>
                )}
              </section>

              <section>
                <h3>
                  {t('secTelegram')}{' '}
                  <span className={snapshot?.telegramActive ? 'set-badge on' : 'set-badge'}>
                    {snapshot?.telegramActive ? t('tgActive') : t('tgOff')}
                  </span>
                </h3>
                <label className="set-field">
                  {t('tgBotToken')}
                  <input type="password" value={tg.botToken ?? ''} onChange={(e) => setTg({ ...tg, botToken: e.target.value })} />
                </label>
                <label className="set-field">
                  {t('tgChatId')}
                  <input
                    inputMode="numeric"
                    value={tg.chatId ?? ''}
                    onChange={(e) => setTg({ ...tg, chatId: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </label>
                <label className="set-field">
                  {t('tgProject')}
                  <input value={tg.project ?? ''} onChange={(e) => setTg({ ...tg, project: e.target.value })} />
                </label>
                <label className="set-field">
                  {t('tgSttProvider')}
                  <select
                    value={tg.sttProvider ?? 'groq'}
                    onChange={(e) => setTg({ ...tg, sttProvider: e.target.value as 'groq' | 'openai' })}
                  >
                    <option value="groq">Groq (Whisper)</option>
                    <option value="openai">OpenAI</option>
                  </select>
                </label>
                <label className="set-field">
                  {t('tgSttKey')}
                  <input type="password" value={tg.sttApiKey ?? ''} onChange={(e) => setTg({ ...tg, sttApiKey: e.target.value })} />
                </label>
                <p className="set-hint">{t('tgHint')}</p>
              </section>

              <section>
                <h3>{t('secProvider')}</h3>
                <label className="set-field">
                  {t('glmConfigDir')}
                  <input value={glm.configDir} onChange={(e) => setGlm({ ...glm, configDir: e.target.value })} />
                </label>
                <label className="set-field">
                  {t('glmModel')}
                  <input value={glm.model} onChange={(e) => setGlm({ ...glm, model: e.target.value })} />
                </label>
                <p className="set-hint">{t('glmHint')}</p>
              </section>

              <section>
                <h3>{t('secQuickActions')}</h3>
                {qa.map((q, i) => (
                  <div key={i} className="set-qa-row">
                    <input
                      placeholder={t('qaLabel')}
                      value={q.label}
                      onChange={(e) => setQa(qa.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    />
                    <input
                      placeholder={t('qaText')}
                      value={q.text}
                      onChange={(e) => setQa(qa.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                    />
                    <button onClick={() => setQa(qa.filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
                <button className="set-qa-add" onClick={() => setQa([...qa, { label: '', text: '' }])}>
                  {t('qaAdd')}
                </button>
              </section>

              <section>
                <h3>{t('secEngine')}</h3>
                <label className="set-field">
                  {t('engineHosts')}
                  <textarea rows={3} value={hosts} onChange={(e) => setHosts(e.target.value)} />
                </label>
                <p className="set-hint">{t('engineHostsHint')}</p>
                <p className="set-hint">{t('engineInfo')(engineVersion, home)}</p>
              </section>

              <section>
                <h3>{t('secUi')}</h3>
                <label className="set-field">
                  {t('langLbl')}
                  <select value={lang} onChange={(e) => setLang(e.target.value)}>
                    <option value="">{t('langAuto')}</option>
                    <option value="it">Italiano</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <p className="set-hint">{t('langReloadHint')}</p>
              </section>
            </>
          )}
        </div>
    </div>
  );
}
