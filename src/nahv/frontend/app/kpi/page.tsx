'use client';
import { useEffect, useState } from 'react';
import { getKpiTargets, KpiTargetsData, eur } from '../../lib/api';

function kpiStatus(item: { waarde: number; doel: number | null; richting: string | null }) {
  if (item.doel === null || item.richting === null) return 'neutral';
  if (item.richting === 'hoog') return item.waarde >= item.doel ? 'ok' : 'warn';
  return item.waarde <= item.doel ? 'ok' : 'warn';
}

function formatWaarde(waarde: number, eenheid: string): string {
  if (eenheid === '€') return eur(waarde);
  if (eenheid === '%') return `${waarde}%`;
  if (eenheid === 'd') return `${waarde}d`;
  return String(waarde);
}

export default function KpiPage() {
  const [data, setData] = useState<KpiTargetsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { getKpiTargets().then(setData).finally(() => setLoading(false)); }, []);

  if (loading) return <div className="flex items-center justify-center h-full"><p className="text-xs font-bold uppercase tracking-widest text-gray-400">Laden...</p></div>;
  if (!data) return null;

  const maxFunnel = data.funnel[0]?.waarde || 1;

  return (
    <div className="p-10 max-w-6xl">
      <div className="mb-10">
        <h2 className="text-3xl font-black tracking-tighter">KPI & Doelen</h2>
        <p className="text-sm text-gray-500 mt-1 font-medium">Doelstellingen vs actuele prestaties</p>
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* KPI table */}
        <div className="border-2 border-black">
          <div className="px-6 py-4 bg-black text-white">
            <h3 className="text-xs font-black uppercase tracking-widest">KPI Overzicht</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid #000' }}>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest">KPI</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest">Actueel</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest">Doel</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.kpis.map((kpi, i) => {
                const st = kpiStatus(kpi);
                return (
                  <tr key={kpi.naam} className="hover:bg-gray-50" style={{ borderBottom: i < data.kpis.length - 1 ? '1px solid #000' : undefined }}>
                    <td className="px-4 py-3 text-xs font-bold uppercase tracking-wide">{kpi.naam}</td>
                    <td className="px-4 py-3 font-black text-sm">{formatWaarde(kpi.waarde, kpi.eenheid)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-bold">{kpi.doelLabel || '—'}</td>
                    <td className="px-4 py-3">
                      {st === 'ok' && <span className="tag bg-black text-white text-xs">Op doel</span>}
                      {st === 'warn' && <span className="tag border-black text-xs">Verbeteren</span>}
                      {st === 'neutral' && <span className="text-xs text-gray-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Funnel */}
        <div className="border-2 border-black">
          <div className="px-6 py-4 bg-black text-white">
            <h3 className="text-xs font-black uppercase tracking-widest">Leads Funnel</h3>
          </div>
          <div className="p-6 space-y-6">
            {data.funnel.map((step) => {
              const pct = Math.round(step.waarde / maxFunnel * 100);
              return (
                <div key={step.label}>
                  <div className="flex justify-between text-sm font-bold mb-2">
                    <span className="uppercase tracking-wide text-xs">{step.label}</span>
                    <span className="font-black">{step.waarde}</span>
                  </div>
                  <div className="w-full bg-gray-100 h-6" style={{ border: '1px solid #000' }}>
                    <div
                      className="bg-black h-full flex items-center justify-end pr-3"
                      style={{ width: `${Math.max(pct, 6)}%` }}
                    >
                      <span className="text-xs text-white font-bold">{pct}%</span>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="pt-4 space-y-3" style={{ borderTop: '2px solid #000' }}>
              <p className="text-xs font-black uppercase tracking-widest mb-3">Conversiestappen</p>
              {data.funnel.slice(1).map((step, i) => {
                const prev = data.funnel[i];
                const rate = prev.waarde > 0 ? Math.round(step.waarde / prev.waarde * 100) : 0;
                return (
                  <div key={step.label} className="flex justify-between text-xs font-bold">
                    <span className="text-gray-500 uppercase tracking-wide">{prev.label} → {step.label}</span>
                    <span className="font-black">{rate}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
