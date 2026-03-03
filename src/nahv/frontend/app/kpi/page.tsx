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

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">Laden...</div>;
  if (!data) return null;

  const maxFunnel = data.funnel[0]?.waarde || 1;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">KPI Dashboard</h2>
        <p className="text-gray-500 text-sm mt-1">Doelstellingen vs actuele prestaties</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* KPI table */}
        <div className="card">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase tracking-wide border-b border-gray-100">
                <th className="px-4 py-3 font-medium">KPI</th>
                <th className="px-4 py-3 font-medium">Actueel</th>
                <th className="px-4 py-3 font-medium">Doel</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.kpis.map(kpi => {
                const st = kpiStatus(kpi);
                return (
                  <tr key={kpi.naam} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-700 font-medium">{kpi.naam}</td>
                    <td className="px-4 py-2.5 font-semibold text-gray-800">{formatWaarde(kpi.waarde, kpi.eenheid)}</td>
                    <td className="px-4 py-2.5 text-gray-500">{kpi.doelLabel || '—'}</td>
                    <td className="px-4 py-2.5">
                      {st === 'ok' && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Op doel</span>}
                      {st === 'warn' && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Verbeteren</span>}
                      {st === 'neutral' && <span className="text-xs text-gray-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Funnel */}
        <div className="card p-6">
          <h3 className="font-semibold text-gray-700 mb-6 text-sm uppercase tracking-wide">Leads funnel</h3>
          <div className="space-y-4">
            {data.funnel.map((step, i) => {
              const pct = Math.round(step.waarde / maxFunnel * 100);
              const colors = ['bg-indigo-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500'];
              return (
                <div key={step.label}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-gray-700">{step.label}</span>
                    <span className="font-bold text-gray-800">{step.waarde}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-6 relative">
                    <div
                      className={`h-6 rounded-full ${colors[i]} flex items-center justify-end pr-3 transition-all`}
                      style={{ width: `${Math.max(pct, 8)}%` }}
                    >
                      <span className="text-xs text-white font-semibold">{pct}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Conversion indicators */}
          <div className="mt-6 pt-4 border-t border-gray-100 space-y-2">
            {data.funnel.slice(1).map((step, i) => {
              const prev = data.funnel[i];
              const rate = prev.waarde > 0 ? Math.round(step.waarde / prev.waarde * 100) : 0;
              return (
                <div key={step.label} className="flex justify-between text-xs text-gray-500">
                  <span>{prev.label} → {step.label}</span>
                  <span className="font-medium text-gray-700">{rate}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
