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
  configMsg: string | null; // esito ultimo import/export config
  projects: { name: string; path: string }[]; // registry (per le quick actions per-progetto)
  onConfigExport: () => void;
  onConfigImport: (files: Record<string, unknown>) => void;
  onSave: (patch: Partial<CockpitSettings>) => void;
  onClose: () => void;
}

interface NotifyCfg {
  notify: boolean;
  notifyPhone: boolean;
  ntfyTopic: string;
}

const IS_ELECTRON = navigator.userAgent.includes('Electron');

export function Settings({ snapshot, engineVersion, home, configMsg, projects, onConfigExport, onConfigImport, onSave, onClose }: Props) {
  // Stato editabile, inizializzato quando arriva lo snapshot dall'engine.
  const [tg, setTg] = useState<CockpitSettings['telegram']>({});
  const [provs, setProvs] = useState<{ name: string; configDir: string; model: string; models: string; modelsUrl: string; modelPrefix: string }[]>([]);
  const [hosts, setHosts] = useState('');
  const [defaultMode, setDefaultMode] = useState('default');
  const [autoCheckpoint, setAutoCheckpoint] = useState(false);
  const [qa, setQa] = useState<QuickActionEntry[]>([]);
  const [notifyCfg, setNotifyCfg] = useState<NotifyCfg | null>(null);
  const [lang, setLang] = useState(() => localStorage.getItem('cockpit-lang') ?? '');
  const [savedFlash, setSavedFlash] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { ref, style, onBarMouseDown } = useDragWin();

  useEffect(() => {
    if (!snapshot || loaded) return;
    setTg(snapshot.data.telegram);
    setProvs(
      Object.entries(snapshot.data.providers).map(([name, p]) => ({
        name,
        configDir: p.configDir ?? '',
        model: p.model ?? '',
        models: (p.models ?? []).join(', '),
        modelsUrl: p.modelsUrl ?? '',
        modelPrefix: p.modelPrefix ?? '',
      })),
    );
    setHosts(snapshot.data.engine.hosts.join('\n'));
    setDefaultMode(snapshot.data.engine.defaultPermissionMode ?? 'default');
    setAutoCheckpoint(snapshot.data.engine.autoCheckpoint ?? false);
    setQa(snapshot.data.quickactions);
    setLoaded(true);
  }, [snapshot, loaded]);

  useEffect(() => {
    if (IS_ELECTRON) void window.cockpit.getConfig().then(setNotifyCfg);
  }, []);

  function save() {
    onSave({
      telegram: { ...tg, chatId: tg.chatId ? Number(tg.chatId) : undefined },
      providers: Object.fromEntries(
        provs
          .filter((p) => p.name.trim() && p.configDir.trim())
          .map((p) => [
            p.name.trim(),
            {
              configDir: p.configDir,
              model: p.model || undefined,
              models: p.models.split(',').map((m) => m.trim()).filter(Boolean),
              modelsUrl: p.modelsUrl || undefined,
              modelPrefix: p.modelPrefix || undefined,
            },
          ]),
      ),
      engine: {
        hosts: hosts.split('\n').map((h) => h.trim()).filter(Boolean),
        defaultPermissionMode: defaultMode as CockpitSettings['engine']['defaultPermissionMode'],
        autoCheckpoint,
      },
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
                <label className="set-field">
                  {t('sttLangLbl')}
                  <select value={tg.sttLanguage ?? 'auto'} onChange={(e) => setTg({ ...tg, sttLanguage: e.target.value })}>
                    <option value="auto">{t('langAuto')}</option>
                    <option value="it">Italiano</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <p className="set-hint">{t('tgHint')}</p>
              </section>

              <section>
                <h3>{t('secProvider')}</h3>
                {provs.map((p, i) => (
                  <div key={i} className="prov-row">
                    <div className="prov-row-head">
                      <input
                        className="prov-name"
                        placeholder={t('provName')}
                        value={p.name}
                        onChange={(e) => setProvs(provs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      />
                      <button className="mini ghost" title={t('provRemove')} onClick={() => setProvs(provs.filter((_, j) => j !== i))}>
                        ✕
                      </button>
                    </div>
                    <label className="set-field">
                      {t('glmConfigDir')}
                      <input value={p.configDir} onChange={(e) => setProvs(provs.map((x, j) => (j === i ? { ...x, configDir: e.target.value } : x)))} />
                    </label>
                    <label className="set-field">
                      {t('glmModel')}
                      <input value={p.model} onChange={(e) => setProvs(provs.map((x, j) => (j === i ? { ...x, model: e.target.value } : x)))} />
                    </label>
                    <label className="set-field">
                      {t('glmModels')}
                      <input value={p.models} onChange={(e) => setProvs(provs.map((x, j) => (j === i ? { ...x, models: e.target.value } : x)))} />
                    </label>
                    <label className="set-field">
                      {t('provModelsUrl')}
                      <input placeholder="https://openrouter.ai/api/v1/models" value={p.modelsUrl} onChange={(e) => setProvs(provs.map((x, j) => (j === i ? { ...x, modelsUrl: e.target.value } : x)))} />
                    </label>
                    <label className="set-field">
                      {t('provModelPrefix')}
                      <input placeholder="openrouter," value={p.modelPrefix} onChange={(e) => setProvs(provs.map((x, j) => (j === i ? { ...x, modelPrefix: e.target.value } : x)))} />
                    </label>
                  </div>
                ))}
                <button className="mini ghost" onClick={() => setProvs([...provs, { name: '', configDir: '', model: '', models: '', modelsUrl: '', modelPrefix: '' }])}>
                  ＋ {t('provAdd')}
                </button>
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
                    <select
                      title={t('qaProjectTitle')}
                      value={q.project ?? ''}
                      onChange={(e) => setQa(qa.map((x, j) => (j === i ? { ...x, project: e.target.value || undefined } : x)))}
                    >
                      <option value="">{t('qaGlobal')}</option>
                      {projects.map((p) => (
                        <option key={p.path} value={p.path}>{p.name}</option>
                      ))}
                    </select>
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
                  {t('defaultModeLbl')}
                  <select value={defaultMode} onChange={(e) => setDefaultMode(e.target.value)}>
                    <option value="default">Default</option>
                    <option value="acceptEdits">Accept edits</option>
                    <option value="bypassPermissions">Bypass</option>
                  </select>
                </label>
                <label className="set-check">
                  <input type="checkbox" checked={autoCheckpoint} onChange={(e) => setAutoCheckpoint(e.target.checked)} />
                  {t('autoCheckpointLbl')}
                </label>
                <p className="set-hint">{t('autoCheckpointHint')}</p>
                <label className="set-field">
                  {t('engineHosts')}
                  <textarea rows={3} value={hosts} onChange={(e) => setHosts(e.target.value)} />
                </label>
                <p className="set-hint">{t('engineHostsHint')}</p>
                <p className="set-hint">{t('engineInfo')(engineVersion, home)}</p>
                <div className="doc-actions">
                  <button className="mini ghost" title={t('cfgExportTitle')} onClick={onConfigExport}>
                    ⤓ {t('cfgExport')}
                  </button>
                  <label className="mini ghost" title={t('cfgImportTitle')} style={{ cursor: 'pointer' }}>
                    ⤒ {t('cfgImport')}
                    <input
                      type="file"
                      accept=".json,application/json"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        void file.text().then((text) => {
                          try {
                            const data = JSON.parse(text) as { cockpitConfig?: Record<string, unknown> };
                            onConfigImport(data.cockpitConfig ?? (data as Record<string, unknown>));
                          } catch {
                            alert(t('cfgImportBad'));
                          }
                        });
                      }}
                    />
                  </label>
                </div>
                {configMsg && <p className="set-hint">{configMsg}</p>}
                <p className="set-hint">{t('cfgHint')}</p>
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
