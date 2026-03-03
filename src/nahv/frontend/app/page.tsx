'use client';
import { useEffect, useState } from 'react';
import { getAnalytics, AnalyticsData, eur, fmtDate, STATUS_LABELS, STATUS_COLORS } from '../lib/api';

function Stat({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`card p-4 border-l-4 ${color}`}>
      <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
      {sub && <p className="text-gray-400 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAnalytics().then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">Laden...</div>;
  if (error || !data) return (
    <div className="p-8">
      <div className="card p-6 border-l-4 border-red-500">
        <p className="text-red-600 font-medium">Backend niet bereikbaar</p>
        <code className="text-xs text-gray-400 mt-2 block">cd src/nahv/backend && npm run dev</code>
      </div>
    </div>
  );

  const s = data.summary;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Data Overzicht</h2>
        <p className="text-gray-500 text-sm mt-1">Nahv leads & klanten statistieken</p>
      </div>

      {/* Row 1: Core counts */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        <Stat label="Totaal leads" value={s.totalLeads} color="border-indigo-500" />
        <Stat label="Gesprekken" value={s.totalGesprekken} color="border-blue-500" />
        <Stat label="Klanten gewonnen" value={s.klantenGewonnen} color="border-green-500" />
        <Stat label="Geen reactie" value={s.geenReactie} color="border-gray-400" />
        <Stat label="Open leads" value={s.openLeads} color="border-yellow-500" />
      </div>

      {/* Row 2: Conversie */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Stat label="Conversie (lead → klant)" value={`${s.conversieLead}%`} sub="van totaal excl. geen reactie" color="border-indigo-400" />
        <Stat label="Conversie (gesprek → klant)" value={`${s.conversieGesprek}%`} sub="van gesprekken" color="border-blue-400" />
      </div>

      {/* Row 3: ARR */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="ARR NAHV leads" value={eur(s.arrNahvLeads)} color="border-green-500" />
        <Stat label="ARR eigen netwerk" value={eur(s.arrEigenNetwerk)} color="border-teal-500" />
        <Stat label="Totaal ARR" value={eur(s.arrTotaal)} sub="gecombineerd" color="border-emerald-600" />
      </div>

      {/* Row 4: Financial metrics */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Gem. offerteprijs" value={eur(s.gemOfferteprijs)} color="border-purple-500" />
        <Stat label="Gem. ARR per klant" value={eur(s.gemArrPerKlant)} color="border-violet-500" />
        <Stat label="Pipeline waarde" value={eur(s.pipelineWaarde)} sub="open offertesals" color="border-orange-500" />
      </div>

      {/* Row 5: Operational metrics */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <Stat label="Gem. opvolgsnelheid" value={`${s.gemDagenOpvolging}d`} sub="dagen tot eerste contact" color="border-sky-500" />
        <Stat label="Mediaan opvolging" value={`${s.medOpvolgsnelheid}d`} color="border-sky-400" />
        <Stat label="Gem. dealcyclus" value={`${s.gemDealcyclus}d`} sub="datum t/m offerte" color="border-cyan-500" />
        <Stat label="Stale leads >14d" value={s.staleLeads14} sub={`${s.staleLeads30} leads >30d`} color={s.staleLeads14 > 0 ? 'border-red-400' : 'border-green-400'} />
      </div>

      {/* Row 6: Activity */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Maanden actief" value={s.maandenActief} color="border-slate-400" />
        <Stat label="Leads per maand" value={s.leadsPerMaand} color="border-slate-500" />
        <Stat label="Klanten per maand" value={s.klantenPerMaand} color="border-slate-600" />
      </div>

      {/* Recent leads + monthly */}
      <div className="grid grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="font-semibold text-gray-700 mb-4 text-sm uppercase tracking-wide">Recente leads</h3>
          <div className="space-y-2">
            {data.recentLeads.map(lead => (
              <div key={lead.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-700">{lead.naam}</p>
                  <p className="text-xs text-gray-400">{lead.bron || '—'} · {fmtDate(lead.datum_binnenkoms)}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[lead.status] || 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABELS[lead.status] || lead.status}
                  </span>
                  {lead.prijs_voorstel && <p className="text-xs text-gray-400 mt-0.5">{eur(lead.prijs_voorstel)}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-semibold text-gray-700 mb-4 text-sm uppercase tracking-wide">Per maand</h3>
          <div className="space-y-3">
            {data.monthlyStats.map(m => {
              const maxLeads = Math.max(...data.monthlyStats.map(x => x.leads), 1);
              const pct = Math.round(m.leads / maxLeads * 100);
              const [y, mo] = m.month.split('-');
              const maandNamen = ['', 'Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
              return (
                <div key={m.month}>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>{maandNamen[parseInt(mo)]} {y}</span>
                    <span>{m.leads} leads · {eur(m.revenue)} ARR</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-indigo-400" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
