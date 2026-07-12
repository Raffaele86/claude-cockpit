import { useMemo, useState } from 'react';
import { t, LOCALE } from '../strings';
import { FloatPanel } from './FloatPanel';
import type { UsageDay } from '../protocol';

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

interface Props {
  days: UsageDay[] | null; // null = report in caricamento
  onClose: () => void;
}

/** Uso token/costi ultimi 30 giorni. Token = storici veri dai transcript; i costi $ esistono
 *  solo da quando l'engine li registra a fine task (niente pricing stimato). */
export function UsagePanel({ days, onClose }: Props) {
  const [provider, setProvider] = useState('');
  const [project, setProject] = useState('');
  const [origin, setOrigin] = useState('');
  const [model, setModel] = useState('');
  const providers = useMemo(() => [...new Set((days ?? []).map((d) => d.provider))].sort(), [days]);
  const projects = useMemo(() => [...new Set((days ?? []).map((d) => d.project))].sort(), [days]);
  const origins = useMemo(() => [...new Set((days ?? []).map((d) => d.origin))].sort(), [days]);
  const models = useMemo(() => [...new Set((days ?? []).map((d) => d.model).filter(Boolean))].sort(), [days]);

  const byDate = useMemo(() => {
    const m = new Map<string, { inTok: number; cacheTok: number; outTok: number; costUsd: number; hasCost: boolean }>();
    for (const d of days ?? []) {
      if ((provider && d.provider !== provider) || (project && d.project !== project) || (origin && d.origin !== origin) || (model && d.model !== model)) continue;
      const row = m.get(d.date) ?? { inTok: 0, cacheTok: 0, outTok: 0, costUsd: 0, hasCost: false };
      row.inTok += d.inTok;
      row.cacheTok += d.cacheTok;
      row.outTok += d.outTok;
      if (d.costUsd != null) {
        row.costUsd += d.costUsd;
        row.hasCost = true;
      }
      m.set(d.date, row);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [days, provider, project, origin, model]);

  const tot = byDate.reduce(
    (a, [, r]) => ({ inTok: a.inTok + r.inTok, cacheTok: a.cacheTok + r.cacheTok, outTok: a.outTok + r.outTok, costUsd: a.costUsd + r.costUsd }),
    { inTok: 0, cacheTok: 0, outTok: 0, costUsd: 0 },
  );

  return (
    <FloatPanel icon="chart" title={t('usageTitle')} className="doctor usage-win" onClose={onClose}>
      <div className="doctor-body">
        {!days ? (
          <p className="doc-note">{t('usageLoading')}</p>
        ) : (
          <>
            <div className="doc-actions">
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="">{t('usageAllProviders')}</option>
                {providers.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <select value={project} onChange={(e) => setProject(e.target.value)}>
                <option value="">{t('usageAllProjects')}</option>
                {projects.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
                <option value="">{t('usageAllOrigins')}</option>
                {origins.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="">{t('usageAllModels')}</option>
                {models.map((m2) => (
                  <option key={m2} value={m2}>{m2}</option>
                ))}
              </select>
            </div>
            {model && <p className="doc-note">{t('usageModelCostNote')}</p>}
            <p className="doc-note">
              {t('usageTotals')(fmtTok(tot.inTok), fmtTok(tot.cacheTok), fmtTok(tot.outTok), tot.costUsd)}
            </p>
            <div className="usage-scroll">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>{t('usageColDate')}</th>
                    <th>in</th>
                    <th>cache</th>
                    <th>out</th>
                    <th>$</th>
                  </tr>
                </thead>
                <tbody>
                  {byDate.map(([date, r]) => (
                    <tr key={date}>
                      <td>{new Date(date).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' })}</td>
                      <td>{fmtTok(r.inTok)}</td>
                      <td>{fmtTok(r.cacheTok)}</td>
                      <td>{fmtTok(r.outTok)}</td>
                      <td>{r.hasCost ? `$${r.costUsd.toFixed(2)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="doc-note">{t('usageCostNote')}</p>
          </>
        )}
      </div>
    </FloatPanel>
  );
}
