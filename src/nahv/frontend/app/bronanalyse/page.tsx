'use client';
import { useEffect, useState } from 'react';
import { getBronanalyse, BronRow, eur } from '../../lib/api';

export default function BronanalysePage() {
  const [data, setData] = useState<BronRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { getBronanalyse().then(setData).finally(() => setLoading(false)); }, []);

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">Laden...</div>;

  const totaalLeads = data.reduce((s, r) => s + r.aantalLeads, 0);
  const totaalKlanten = data.reduce((s, r) => s + r.aantalKlanten, 0);
  const totaalArr = data.reduce((s, r) => s + r.arrTotaal, 0);
  const maxArr = Math.max(...data.map(r => r.arrTotaal), 1);

  const catColors: Record<string, string> = {
    'Klant NAHV': 'bg-indigo-500',
    'Google': 'bg-blue-500',
    'Academie': 'bg-purple-500',
    'Referral/Netwerk': 'bg-green-500',
    'Eigen acquisitie': 'bg-yellow-500',
    'Onbekend': 'bg-gray-400',
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Bronanalyse</h2>
        <p className="text-gray-500 text-sm mt-1">Conversie en ARR per acquisitiekanaal</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card p-4 border-l-4 border-indigo-500">
          <p className="text-gray-500 text-xs uppercase tracking-wide">Totaal leads (met bron)</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{totaalLeads}</p>
        </div>
        <div className="card p-4 border-l-4 border-green-500">
          <p className="text-gray-500 text-xs uppercase tracking-wide">Klanten gewonnen</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{totaalKlanten}</p>
        </div>
        <div className="card p-4 border-l-4 border-emerald-500">
          <p className="text-gray-500 text-xs uppercase tracking-wide">Totaal ARR (NAHV leads)</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{eur(totaalArr)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Table */}
        <div className="card">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase tracking-wide border-b border-gray-100">
                <th className="px-4 py-3 font-medium">Bron</th>
                <th className="px-4 py-3 font-medium">Leads</th>
                <th className="px-4 py-3 font-medium">Klanten</th>
                <th className="px-4 py-3 font-medium">Conversie</th>
                <th className="px-4 py-3 font-medium">ARR</th>
                <th className="px-4 py-3 font-medium">Gem./klant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.map(row => (
                <tr key={row.categorie} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${catColors[row.categorie] || 'bg-gray-400'}`} />
                      <span className="font-medium text-gray-700">{row.categorie}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{row.aantalLeads}</td>
                  <td className="px-4 py-3 text-gray-600">{row.aantalKlanten}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${row.conversie >= 70 ? 'bg-green-100 text-green-700' : row.conversie >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                      {row.conversie}%
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-700">{row.arrTotaal > 0 ? eur(row.arrTotaal) : '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{row.gemArrPerKlant > 0 ? eur(row.gemArrPerKlant) : '—'}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td className="px-4 py-3 font-bold text-gray-800">TOTAAL</td>
                <td className="px-4 py-3 font-bold">{totaalLeads}</td>
                <td className="px-4 py-3 font-bold">{totaalKlanten}</td>
                <td className="px-4 py-3 font-bold">{totaalLeads > 0 ? Math.round(totaalKlanten / totaalLeads * 100) : 0}%</td>
                <td className="px-4 py-3 font-bold">{eur(totaalArr)}</td>
                <td className="px-4 py-3 font-bold">{totaalKlanten > 0 ? eur(Math.round(totaalArr / totaalKlanten)) : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Bar chart */}
        <div className="card p-6">
          <h3 className="font-semibold text-gray-700 mb-4 text-sm uppercase tracking-wide">ARR per kanaal</h3>
          <div className="space-y-4">
            {data.filter(r => r.arrTotaal > 0).map(row => {
              const pct = Math.round(row.arrTotaal / maxArr * 100);
              return (
                <div key={row.categorie}>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span className="font-medium">{row.categorie}</span>
                    <span>{eur(row.arrTotaal)} · {row.aantalKlanten} klanten</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-4">
                    <div className={`h-4 rounded-full ${catColors[row.categorie] || 'bg-gray-400'} flex items-center justify-end pr-2`}
                      style={{ width: `${Math.max(pct, 5)}%` }}>
                      <span className="text-xs text-white font-semibold">{row.conversie}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Leads per kanaal</h4>
            <div className="space-y-2">
              {data.map(row => {
                const pct = Math.round(row.aantalLeads / totaalLeads * 100);
                return (
                  <div key={row.categorie} className="flex items-center gap-2 text-xs">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${catColors[row.categorie] || 'bg-gray-400'}`} />
                    <span className="text-gray-600 w-36 truncate">{row.categorie}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className={`h-2 rounded-full ${catColors[row.categorie] || 'bg-gray-400'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-gray-500 w-10 text-right">{row.aantalLeads}</span>
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
