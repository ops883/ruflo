'use client';
import { useEffect, useState } from 'react';
import { getBronanalyse, BronRow, eur } from '../../lib/api';

export default function BronanalysePage() {
  const [data, setData] = useState<BronRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { getBronanalyse().then(setData).finally(() => setLoading(false)); }, []);

  if (loading) return <div className="flex items-center justify-center h-full"><p className="text-xs font-bold uppercase tracking-widest text-gray-400">Laden...</p></div>;

  const totaalLeads = data.reduce((s, r) => s + r.aantalLeads, 0);
  const totaalKlanten = data.reduce((s, r) => s + r.aantalKlanten, 0);
  const totaalArr = data.reduce((s, r) => s + r.arrTotaal, 0);
  const maxArr = Math.max(...data.map(r => r.arrTotaal), 1);
  const maxLeads = Math.max(...data.map(r => r.aantalLeads), 1);

  return (
    <div className="p-10 max-w-6xl">
      <div className="mb-10">
        <h2 className="text-3xl font-black tracking-tighter">Bronanalyse</h2>
        <p className="text-sm text-gray-500 mt-1 font-medium">Conversie en ARR per acquisitiekanaal</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        {[
          { label: 'Totaal Leads (met bron)', value: String(totaalLeads) },
          { label: 'Klanten Gewonnen', value: String(totaalKlanten) },
          { label: 'Totaal ARR (NAHV Leads)', value: eur(totaalArr) },
        ].map(m => (
          <div key={m.label} className="border-2 border-black p-6">
            <p className="stat-label">{m.label}</p>
            <p className="text-3xl font-black tracking-tighter mt-1">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* Table */}
        <div className="border-2 border-black">
          <div className="px-6 py-4 bg-black text-white">
            <h3 className="text-xs font-black uppercase tracking-widest">Per Kanaal</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid #000' }}>
                {['Bron', 'Leads', 'Klanten', 'Conversie', 'ARR', 'Gem./Klant'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={row.categorie} className="hover:bg-gray-50" style={{ borderBottom: i < data.length - 1 ? '1px solid #000' : undefined }}>
                  <td className="px-4 py-3 font-bold text-xs uppercase tracking-wide">{row.categorie}</td>
                  <td className="px-4 py-3 font-bold">{row.aantalLeads}</td>
                  <td className="px-4 py-3 font-bold">{row.aantalKlanten}</td>
                  <td className="px-4 py-3">
                    <span className={`tag text-xs ${row.conversie >= 70 ? 'bg-black text-white' : 'border-black'}`}>
                      {row.conversie}%
                    </span>
                  </td>
                  <td className="px-4 py-3 font-black">{row.arrTotaal > 0 ? eur(row.arrTotaal) : '—'}</td>
                  <td className="px-4 py-3 text-gray-500 font-bold">{row.gemArrPerKlant > 0 ? eur(row.gemArrPerKlant) : '—'}</td>
                </tr>
              ))}
              <tr className="bg-black text-white">
                <td className="px-4 py-3 font-black text-xs uppercase tracking-widest">Totaal</td>
                <td className="px-4 py-3 font-black">{totaalLeads}</td>
                <td className="px-4 py-3 font-black">{totaalKlanten}</td>
                <td className="px-4 py-3 font-black">{totaalLeads > 0 ? Math.round(totaalKlanten / totaalLeads * 100) : 0}%</td>
                <td className="px-4 py-3 font-black">{eur(totaalArr)}</td>
                <td className="px-4 py-3 font-black">{totaalKlanten > 0 ? eur(Math.round(totaalArr / totaalKlanten)) : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Bar charts */}
        <div className="border-2 border-black">
          <div className="px-6 py-4 bg-black text-white">
            <h3 className="text-xs font-black uppercase tracking-widest">ARR per Kanaal</h3>
          </div>
          <div className="p-6 space-y-5">
            {data.filter(r => r.arrTotaal > 0).map(row => {
              const pct = Math.round(row.arrTotaal / maxArr * 100);
              return (
                <div key={row.categorie}>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <span className="uppercase tracking-wide">{row.categorie}</span>
                    <span>{eur(row.arrTotaal)} · {row.aantalKlanten} kl.</span>
                  </div>
                  <div className="w-full bg-gray-100 h-5" style={{ border: '1px solid #000' }}>
                    <div className="bg-black h-full flex items-center justify-end pr-2" style={{ width: `${Math.max(pct, 5)}%` }}>
                      <span className="text-xs text-white font-bold">{row.conversie}%</span>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="pt-4 space-y-3" style={{ borderTop: '2px solid #000' }}>
              <p className="text-xs font-black uppercase tracking-widest mb-3">Leads per kanaal</p>
              {data.map(row => {
                const pct = Math.round(row.aantalLeads / maxLeads * 100);
                return (
                  <div key={row.categorie} className="flex items-center gap-3">
                    <span className="text-xs font-bold uppercase w-36 truncate">{row.categorie}</span>
                    <div className="flex-1 bg-gray-100 h-3" style={{ border: '1px solid #000' }}>
                      <div className="bg-black h-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-bold w-6 text-right">{row.aantalLeads}</span>
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
