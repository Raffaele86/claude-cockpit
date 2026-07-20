import { useMemo } from 'react';
import { t } from '../strings';
import { useConfirm } from './ConfirmDialog';
import { FloatPanel } from './FloatPanel';
import { Icon } from './icons';
import type { EngineProc, EngineStats, ServiceStatus } from '../protocol';

interface Props {
  stats: EngineStats | null; // null = statistiche in caricamento
  services: ServiceStatus[] | null; // null = non ancora arrivato, [] = feature spenta (config assente)
  onClose: () => void;
  onKill: (pid: number) => void;
}

function fmtUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function kindLabel(kind: EngineProc['kind']): string {
  if (kind === 'sdk') return t('sysKindSdk');
  if (kind === 'pty') return t('sysKindPty');
  if (kind === 'mcp') return t('sysKindMcp');
  return t('sysKindOther');
}

// Chiave pty tipica: 'path##tab' → mostra solo il basename + il tab.
function projectLabel(p?: string): string {
  if (!p) return '—';
  const [path, tab] = p.split('##');
  const name = path.split('/').filter(Boolean).at(-1) || path;
  return tab ? `${name}##${tab}` : name;
}

/** Memoria engine (cgroup-accurate) + processi discendenti, con kill selettivo (SIGTERM). */
export function SystemPanel({ stats, services, onClose, onKill }: Props) {
  const { confirm, dialog } = useConfirm();
  const procs = useMemo(() => [...(stats?.procs ?? [])].sort((a, b) => b.rssMb - a.rssMb), [stats]);

  return (
    <>
    <FloatPanel icon="pulse" title={t('sysTitle')} className="doctor usage-win" onClose={onClose}>
      <div className="doctor-body">
        {services && services.length > 0 && (
          <div className="sys-services">
            {services.map((s) => (
              <div className="sys-svc" key={s.name} title={s.error ?? s.url}>
                <span className={`sys-svc-dot ${s.ok ? 'ok' : 'bad'}`} />
                <span className="sys-svc-name">{s.name}</span>
                <span className="sys-svc-info">{s.ok ? `${s.code ?? ''} · ${s.ms ?? 0}ms` : s.error ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
        {!stats ? (
          <p className="doc-note">{t('sysLoading')}</p>
        ) : (
          <>
            <p className="doc-note">{t('sysEngineInfo')(stats.version, fmtUptime(stats.uptimeSec))}</p>
            <p className="doc-note">
              {t('sysMemEngineLabel')}: {Math.round(stats.rssMb)} MB
              {stats.currentMb != null && ` · ${t('sysMemCgroupLabel')}: ${Math.round(stats.currentMb)} MB`}
              {stats.peakMb != null && ` (${t('sysMemPeakLabel')} ${Math.round(stats.peakMb)} MB)`}
              {stats.maxMb != null && ` / ${Math.round(stats.maxMb)} MB`}
            </p>
            {stats.maxMb != null && stats.currentMb != null && (
              <div className="sys-membar">
                <div className="sys-membar-fill" style={{ width: `${Math.min(100, (stats.currentMb / stats.maxMb) * 100)}%` }} />
              </div>
            )}
            {procs.length === 0 ? (
              <p className="doc-note">{t('sysEmpty')}</p>
            ) : (
              <div className="usage-scroll">
                <table className="sys-table">
                  <thead>
                    <tr>
                      <th>{t('sysColKind')}</th>
                      <th>{t('sysColProject')}</th>
                      <th className="sys-num">{t('sysColRss')}</th>
                      <th>{t('sysColAge')}</th>
                      <th>{t('sysColCmd')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {procs.map((p) => (
                      <tr key={p.pid}>
                        <td>
                          <span className="sys-kind">{kindLabel(p.kind)}</span>
                        </td>
                        <td>{projectLabel(p.project)}</td>
                        <td className="sys-num">{Math.round(p.rssMb)}</td>
                        <td>{p.etime}</td>
                        <td className="sys-cmd" title={p.cmd}>
                          {p.cmd}
                        </td>
                        <td>
                          <button
                            className="mini ghost btn-icon"
                            title={t('sysKillTitle')} aria-label={t('sysKillTitle')}
                            onClick={() => {
                              void confirm({ message: t('sysKillConfirm')(p.pid), danger: true }).then((ok) => ok && onKill(p.pid));
                            }}
                          >
                            <Icon name="close" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </FloatPanel>
      {dialog}
    </>
  );
}
