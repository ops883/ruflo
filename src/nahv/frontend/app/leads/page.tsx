'use client';
import { useEffect, useState } from 'react';
import { getLeads, deleteLead, Lead, STATUS_LABELS, eur, fmtDate } from '../../lib/api';
import LeadModal from '../../components/LeadModal';

const STATUS_TAGS: Record<string, string> = {
  'Klant': 'bg-black text-white',
  'Geen reactie': 'border border-black text-gray-500',
  'Offerte verstuurd': 'bg-black text-white',
  'Contact gelegd': 'border border-black',
  'Afspraak gepland': 'border border-black',
};

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
    <div className="p-10">
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tighter">Leads</h2>
          <p className="text-sm text-gray-500 mt-1 font-medium">{filtered.length} leads</p>
        </div>
        <button className="btn-primary" onClick={() => setModalLead(null)}>+ Nieuwe Lead</button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          className="input flex-1"
          placeholder="Zoek op naam, e-mail of bron..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="input w-52" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Alle statussen</option>
          {Object.keys(STATUS_LABELS).map(v => <option key={v} value={v}>{STATUS_LABELS[v]}</option>)}
        </select>
        <select className="input w-44" value={klantFilter} onChange={e => setKlantFilter(e.target.value)}>
          <option value="">Alle</option>
          <option value="Ja">Klant geworden</option>
          <option value="Nee">Afgewezen</option>
        </select>
      </div>

      {/* Table */}
      <div className="border-2 border-black">
        {loading ? (
          <div className="p-12 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Laden...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Geen leads gevonden.</p>
            <button className="btn-primary mt-4" onClick={() => setModalLead(null)}>Eerste lead aanmaken</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-black text-white">
                  {['Naam', 'Taal', 'Datum', 'Status', 'Next Action', 'Kennismaking', 'Prijs', 'Bron', 'Klant', 'Type', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-black uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead, i) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-gray-50"
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid #000' : undefined }}
                  >
                    <td className="px-4 py-3">
                      <p className="font-black uppercase tracking-tight">{lead.naam}</p>
                      <p className="text-gray-500 mt-0.5 truncate max-w-xs">{lead.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`tag text-xs ${lead.taal === 'EN' ? 'bg-black text-white' : 'border-black'}`}>{lead.taal}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-bold">{fmtDate(lead.datum_binnenkoms)}</td>
                    <td className="px-4 py-3">
                      <span className={`tag text-xs ${STATUS_TAGS[lead.status] || 'border-black'}`}>{lead.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-bold">{lead.next_action || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 font-bold">{fmtDate(lead.kennismaking)}</td>
                    <td className="px-4 py-3 font-black">{lead.prijs_voorstel ? eur(lead.prijs_voorstel) : '—'}</td>
                    <td className="px-4 py-3 text-gray-600 font-bold">{lead.bron || '—'}</td>
                    <td className="px-4 py-3">
                      {lead.klant_geworden === 'Ja' && <span className="tag bg-black text-white text-xs">Ja</span>}
                      {lead.klant_geworden === 'Nee' && <span className="tag border-black text-xs">Nee</span>}
                      {lead.klant_geworden === '' && <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-bold">{lead.type_klant || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button
                          className="btn-secondary text-xs px-3 py-1.5"
                          onClick={() => setModalLead(lead)}
                        >Bewerk</button>
                        <button
                          className="btn-danger text-xs px-3 py-1.5"
                          onClick={() => handleDelete(lead)}
                          disabled={deleting === lead.id}
                        >{deleting === lead.id ? '...' : 'Verwijder'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalLead !== undefined && (
        <LeadModal lead={modalLead} onClose={() => setModalLead(undefined)} onSaved={handleSaved} />
      )}
    </div>
  );
}
