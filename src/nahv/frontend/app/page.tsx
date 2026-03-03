'use client';
import { useEffect, useState } from 'react';
import { getAnalytics, AnalyticsData, eur, fmtDate } from '../lib/api';
import Link from 'next/link';

export default function DashboardPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAnalytics().then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Laden...</p>
    </div>
  );

  if (error || !data) return (
    <div className="p-10">
      <div className="border-2 border-black p-6 border-l-8">
        <p className="font-bold uppercase tracking-widest text-sm">Backend niet bereikbaar</p>
        <code className="text-xs text-gray-500 mt-2 block">cd src/nahv/backend && npm run dev</code>
      </div>
    </div>
  );

  const s = data.summary;
  const maandNamen = ['', 'Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

  return (
    <div className="p-10 max-w-7xl">
      {/* Header */}
      <header className="mb-10 flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-black tracking-tighter">Welkom terug, Pim</h2>
          <p className="text-sm text-gray-500 mt-1 font-medium">Dit is het overzicht van vandaag.</p>
        </div>
        <Link href="/leads" className="btn-primary text-xs px-5 py-3">+ Nieuwe Lead</Link>
      </header>

      {/* Executive Summary */}
      <div className="mb-10 bg-black text-white p-8" style={{ borderLeft: '8px solid #555' }}>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Executive Summary</p>
        <p className="text-2xl font-black tracking-tighter leading-snug">
          {s.totalLeads} leads ontvangen.{' '}
          <span className="underline decoration-2 underline-offset-4">{s.klantenGewonnen} klanten gewonnen</span>.{' '}
          ARR: <span className="font-black">{eur(s.arrTotaal)}</span>.
        </p>
        <p className="text-sm text-gray-400 mt-4">
          Pijplijn: <span className="text-white font-bold">{eur(s.pipelineWaarde)}</span> open voorstellen.
          {s.staleLeads14 > 0 && (
            <span className="text-red-400 font-bold ml-3">⚠ {s.staleLeads14} leads staan &gt;14 dagen open.</span>
          )}
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* ARR */}
        <div className="border-2 border-black p-8 flex flex-col justify-between">
          <div>
            <p className="stat-label">Totaal ARR (Actief)</p>
            <div className="text-5xl font-black tracking-tighter mt-2">{eur(s.arrTotaal)}</div>
          </div>
          <div className="mt-8 pt-5" style={{ borderTop: '2px solid #000' }}>
            <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
              <span>NAHV Leads</span>
              <span>Eigen Netwerk</span>
            </div>
            <div className="flex justify-between font-black text-lg">
              <span>{eur(s.arrNahvLeads)}</span>
              <span>{eur(s.arrEigenNetwerk)}</span>
            </div>
          </div>
        </div>

        {/* Klanten */}
        <div className="border-2 border-black p-8 flex flex-col justify-between">
          <div>
            <p className="stat-label">Klanten Gewonnen</p>
            <div className="flex items-baseline gap-4 mt-2">
              <div className="text-5xl font-black tracking-tighter">{s.klantenGewonnen}</div>
              <div className="text-sm font-bold text-gray-500 uppercase">klanten</div>
            </div>
          </div>
          <div className="mt-8 pt-5" style={{ borderTop: '2px solid #000' }}>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Conversie Lead → Klant</span>
              <span className="text-2xl font-black">{s.conversieLead}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-4 gap-4 mb-10">
        {[
          { label: 'Totaal Leads', value: String(s.totalLeads) },
          { label: 'Pipeline Waarde', value: eur(s.pipelineWaarde) },
          { label: 'Gem. Dealcyclus', value: `${s.gemDealcyclus}d` },
          { label: 'Stale >14d', value: String(s.staleLeads14), alert: s.staleLeads14 > 0 },
          { label: 'Gesprekken', value: String(s.totalGesprekken) },
          { label: 'Open Leads', value: String(s.openLeads) },
          { label: 'Gem. Opvolging', value: `${s.gemDagenOpvolging}d` },
          { label: 'Per Maand', value: `${s.klantenPerMaand} kl.` },
        ].map(m => (
          <div key={m.label} className={`p-5 border-2 ${m.alert ? 'border-black bg-black text-white' : 'border-black'}`}>
            <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${m.alert ? 'text-gray-400' : 'text-gray-500'}`}>{m.label}</p>
            <p className="text-2xl font-black tracking-tighter">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-3 gap-6">
        {/* Recente leads */}
        <div className="col-span-2 border-2 border-black">
          <div className="px-6 py-4" style={{ borderBottom: '2px solid #000' }}>
            <h3 className="text-xs font-black uppercase tracking-widest">Recente Leads</h3>
          </div>
          <div className="divide-y divide-black">
            {data.recentLeads.slice(0, 6).map(lead => (
              <div key={lead.id} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50">
                <div>
                  <p className="font-bold text-sm uppercase tracking-tight">{lead.naam}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{lead.bron || '—'} · {fmtDate(lead.datum_binnenkoms)}</p>
                </div>
                <div className="flex items-center gap-4">
                  {lead.prijs_voorstel && <span className="text-sm font-black">{eur(lead.prijs_voorstel)}</span>}
                  <span className="tag">{lead.status}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="px-6 py-3" style={{ borderTop: '2px solid #000' }}>
            <Link href="/leads" className="text-xs font-bold uppercase tracking-widest hover:underline">Bekijk alle leads →</Link>
          </div>
        </div>

        {/* Per maand */}
        <div className="border-2 border-black">
          <div className="px-6 py-4" style={{ borderBottom: '2px solid #000' }}>
            <h3 className="text-xs font-black uppercase tracking-widest">Per Maand</h3>
          </div>
          <div className="p-6 space-y-4">
            {data.monthlyStats.map(m => {
              const maxLeads = Math.max(...data.monthlyStats.map(x => x.leads), 1);
              const pct = Math.round(m.leads / maxLeads * 100);
              const [y, mo] = m.month.split('-');
              return (
                <div key={m.month}>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span>{maandNamen[parseInt(mo)]} {y}</span>
                    <span>{m.leads} leads · {eur(m.revenue)}</span>
                  </div>
                  <div className="w-full bg-gray-100 h-2" style={{ border: '1px solid #000' }}>
                    <div className="bg-black h-full" style={{ width: `${pct}%` }} />
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
