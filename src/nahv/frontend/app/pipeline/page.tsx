'use client';
import { useEffect, useState } from 'react';
import { getPipelineOpen, PipelineOverview, eur, fmtDate, STATUS_COLORS } from '../../lib/api';

export default function PipelinePage() {
  const [data, setData] = useState<PipelineOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { getPipelineOpen().then(setData).finally(() => setLoading(false)); }, []);

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">Laden...</div>;
  if (!data) return null;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Pipeline Overzicht</h2>
        <p className="text-gray-500 text-sm mt-1">Open offertes en aankomende gesprekken</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="card p-4 border-l-4 border-yellow-500">
          <p className="text-gray-500 text-xs uppercase tracking-wide">Open leads</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{data.openLeads.length}</p>
        </div>
        <div className="card p-4 border-l-4 border-orange-500">
          <p className="text-gray-500 text-xs uppercase tracking-wide">Pipeline waarde</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{eur(data.pipelineWaarde)}</p>
        </div>
        <div className="card p-4 border-l-4 border-blue-500">
          <p className="text-gray-500 text-xs uppercase tracking-wide">Gem. dealcyclus</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{data.gemDealcyclus}d</p>
        </div>
        <div className={`card p-4 border-l-4 ${data.staleLeads14 > 0 ? 'border-red-500' : 'border-green-500'}`}>
          <p className="text-gray-500 text-xs uppercase tracking-wide">Stale leads (&gt;14d)</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{data.staleLeads14}</p>
        </div>
      </div>

      {/* Open leads table */}
      {data.openLeads.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-400 text-sm">Geen open leads in de pipeline.</p>
        </div>
      ) : (
        <div className="card">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase tracking-wide border-b border-gray-100">
                <th className="px-4 py-3 font-medium">Naam</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Prijs voorstel</th>
                <th className="px-4 py-3 font-medium">Bron</th>
                <th className="px-4 py-3 font-medium">Datum binnenkomst</th>
                <th className="px-4 py-3 font-medium">Kennismaking</th>
                <th className="px-4 py-3 font-medium">Dagen open</th>
                <th className="px-4 py-3 font-medium">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.openLeads.map(lead => {
                const urgency = lead.dagenOpen > 14 ? 'bg-red-50' : lead.dagenOpen > 7 ? 'bg-yellow-50' : '';
                return (
                  <tr key={lead.id} className={`hover:bg-gray-50 transition-colors ${urgency}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{lead.naam}</p>
                      <p className="text-xs text-gray-400">{lead.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[lead.status] || 'bg-gray-100 text-gray-500'}`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-700">{lead.prijs_voorstel ? eur(lead.prijs_voorstel) : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{lead.bron || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(lead.datum_binnenkoms)}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(lead.kennismaking)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${lead.dagenOpen > 14 ? 'bg-red-100 text-red-700' : lead.dagenOpen > 7 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                        {lead.dagenOpen}d
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{lead.type_klant || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
