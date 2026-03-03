'use client';
import { useEffect, useState } from 'react';
import { getLeads, deleteLead, Lead, STATUS_LABELS, STATUS_COLORS, eur, fmtDate } from '../../lib/api';
import LeadModal from '../../components/LeadModal';

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [klantFilter, setKlantFilter] = useState('');
  const [modalLead, setModalLead] = useState<Lead | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setLeads(await getLeads()); } catch { } finally { setLoading(false); }
  }

  async function handleDelete(lead: Lead) {
    if (!confirm(`Weet je zeker dat je ${lead.naam} wilt verwijderen?`)) return;
    setDeleting(lead.id);
    await deleteLead(lead.id);
    setLeads(ls => ls.filter(l => l.id !== lead.id));
    setDeleting(null);
  }

  function handleSaved(saved: Lead) {
    setLeads(ls => {
      const idx = ls.findIndex(l => l.id === saved.id);
      if (idx >= 0) { const c = [...ls]; c[idx] = saved; return c; }
      return [saved, ...ls];
    });
    setModalLead(undefined);
  }

  const filtered = leads.filter(l => {
    const q = search.toLowerCase();
    const matchSearch = !q || l.naam.toLowerCase().includes(q) || l.email.toLowerCase().includes(q) || (l.bron || '').toLowerCase().includes(q);
    const matchStatus = !statusFilter || l.status === statusFilter;
    const matchKlant = !klantFilter || l.klant_geworden === klantFilter;
    return matchSearch && matchStatus && matchKlant;
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Leads</h2>
          <p className="text-gray-500 text-sm mt-1">{filtered.length} leads</p>
        </div>
        <button className="btn-primary" onClick={() => setModalLead(null)}>+ Nieuwe lead</button>
      </div>

      <div className="card mb-4">
        <div className="p-4 flex gap-3 border-b border-gray-100">
          <input className="input flex-1" placeholder="Zoek op naam, e-mail of bron..." value={search} onChange={e => setSearch(e.target.value)} />
          <select className="input w-48" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Alle statussen</option>
            {Object.keys(STATUS_LABELS).map(v => <option key={v} value={v}>{STATUS_LABELS[v]}</option>)}
          </select>
          <select className="input w-40" value={klantFilter} onChange={e => setKlantFilter(e.target.value)}>
            <option value="">Alle</option>
            <option value="Ja">Klant geworden</option>
            <option value="Nee">Afgewezen</option>
            <option value="">In behandeling</option>
          </select>
        </div>

        {loading ? <div className="p-12 text-center text-gray-400 text-sm">Laden...</div>
          : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-400 text-sm">Geen leads gevonden.</p>
              <button className="btn-primary mt-4" onClick={() => setModalLead(null)}>Eerste lead aanmaken</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">Naam</th>
                    <th className="px-4 py-3 font-medium">Taal</th>
                    <th className="px-4 py-3 font-medium">Datum</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Next action</th>
                    <th className="px-4 py-3 font-medium">Kennismaking</th>
                    <th className="px-4 py-3 font-medium">Prijs</th>
                    <th className="px-4 py-3 font-medium">Bron</th>
                    <th className="px-4 py-3 font-medium">Klant</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(lead => (
                    <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{lead.naam}</p>
                        <p className="text-xs text-gray-400">{lead.email}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${lead.taal === 'EN' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>{lead.taal}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(lead.datum_binnenkoms)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[lead.status] || 'bg-gray-100 text-gray-500'}`}>{lead.status}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{lead.next_action || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(lead.kennismaking)}</td>
                      <td className="px-4 py-3 text-gray-700 font-medium">{lead.prijs_voorstel ? eur(lead.prijs_voorstel) : '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{lead.bron || '—'}</td>
                      <td className="px-4 py-3">
                        {lead.klant_geworden === 'Ja' && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Ja</span>}
                        {lead.klant_geworden === 'Nee' && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Nee</span>}
                        {lead.klant_geworden === '' && <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{lead.type_klant || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <button className="text-indigo-600 hover:text-indigo-800 text-xs font-medium px-2 py-1 rounded hover:bg-indigo-50" onClick={() => setModalLead(lead)}>Bewerk</button>
                          <button className="text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1 rounded hover:bg-red-50" onClick={() => handleDelete(lead)} disabled={deleting === lead.id}>{deleting === lead.id ? '...' : 'Verwijder'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {modalLead !== undefined && <LeadModal lead={modalLead} onClose={() => setModalLead(undefined)} onSaved={handleSaved} />}
    </div>
  );
}
