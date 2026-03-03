'use client';
import { useEffect, useState } from 'react';
import { getLeads, Lead, eur, fmtDate, createLead, updateLead } from '../../lib/api';

const COLS = ['Contact gelegd', 'Geen reactie', 'Afspraak gepland', 'Offerte verstuurd', 'Klant'] as const;

function dagenOpen(lead: Lead): number {
  if (!lead.datum_binnenkoms) return 0;
  return Math.round((Date.now() - new Date(lead.datum_binnenkoms).getTime()) / 86400000);
}

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newNaam, setNewNaam] = useState('');
  const [newPrijs, setNewPrijs] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(false);
    try {
      const data = await getLeads();
      setLeads(data);
    } catch { } finally { setLoading(false); }
  }

  async function handleDrop(e: React.DragEvent, targetStatus: string) {
    e.preventDefault();
    const id = parseInt(e.dataTransfer.getData('leadId'));
    const lead = leads.find(l => l.id === id);
    if (!lead || lead.status === targetStatus) return;
    const updated = await updateLead(id, { status: targetStatus as Lead['status'] });
    setLeads(ls => ls.map(l => l.id === id ? updated : l));
  }

  async function handleAdd() {
    if (!newNaam.trim()) return;
    const lead = await createLead({
      naam: newNaam.trim(),
      prijs_voorstel: newPrijs ? parseFloat(newPrijs) : null,
      status: 'Contact gelegd',
      taal: 'NL',
      email: '',
      next_action: '',
      klant_geworden: '',
    });
    setLeads(ls => [lead, ...ls]);
    setNewNaam('');
    setNewPrijs('');
    setAdding(false);
  }

  const totalPipe = leads
    .filter(l => l.status !== 'Klant' && l.status !== 'Geen reactie')
    .reduce((s, l) => s + (l.prijs_voorstel || 0), 0);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Laden...</p>
    </div>
  );

  return (
    <div className="p-10 h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-end mb-6 shrink-0">
        <div>
          <h2 className="text-3xl font-black tracking-tighter">Pijplijn</h2>
          <p className="text-sm text-gray-500 mt-1 font-medium">Actieve verkooptrajecten</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="border-2 border-black px-4 py-2">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Pijplijn: </span>
            <span className="font-black text-sm">{eur(totalPipe)}</span>
          </div>
          <button className="btn-primary" onClick={() => setAdding(true)}>+ Nieuwe Lead</button>
        </div>
      </div>

      {/* Add lead form */}
      {adding && (
        <div className="mb-4 border-2 border-black p-4 flex gap-3 items-end shrink-0">
          <div className="flex-1">
            <label className="label">Naam</label>
            <input className="input" placeholder="Naam klant..." value={newNaam} onChange={e => setNewNaam(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} autoFocus />
          </div>
          <div className="w-40">
            <label className="label">Prijs voorstel (€)</label>
            <input className="input" type="number" placeholder="0" value={newPrijs} onChange={e => setNewPrijs(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={handleAdd}>Toevoegen</button>
          <button className="btn-secondary" onClick={() => setAdding(false)}>Annuleer</button>
        </div>
      )}

      {/* Kanban */}
      <div className="flex gap-4 flex-1 overflow-x-auto overflow-y-hidden pb-6">
        {COLS.map(col => {
          const cards = leads.filter(l => l.status === col);
          const colSum = cards.reduce((s, l) => s + (l.prijs_voorstel || 0), 0);
          return (
            <div
              key={col}
              className="flex flex-col shrink-0"
              style={{ width: 280 }}
              onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.background = '#f2f2f2'; }}
              onDragLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
              onDrop={e => { (e.currentTarget as HTMLElement).style.background = ''; handleDrop(e, col); }}
            >
              {/* Column header */}
              <div className={`px-4 py-3 mb-3 flex justify-between items-center ${col === 'Klant' ? 'bg-black text-white' : 'bg-white border-b-2 border-black'}`}
                style={{ border: col === 'Klant' ? undefined : '2px solid #000', borderBottom: col === 'Klant' ? undefined : '2px solid #000' }}>
                <span className="text-xs font-black uppercase tracking-widest">{col}</span>
                <div className="flex items-center gap-2">
                  {colSum > 0 && <span className="text-xs font-bold opacity-70">{eur(colSum)}</span>}
                  <span className={`text-xs font-black px-1.5 py-0.5 border ${col === 'Klant' ? 'border-white text-white' : 'border-black'}`}>{cards.length}</span>
                </div>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto space-y-2 p-1">
                {cards.length === 0 && (
                  <div className="text-center py-8 border-2 border-dashed border-gray-300">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Sleep hierheen</p>
                  </div>
                )}
                {cards.map(lead => {
                  const dagen = dagenOpen(lead);
                  const stale = dagen > 14 && col !== 'Klant';
                  return (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={e => e.dataTransfer.setData('leadId', String(lead.id))}
                      className="bg-white p-4 cursor-grab hover:bg-black hover:text-white group"
                      style={{ border: stale ? '2px solid #000' : '1px solid #000', borderLeft: stale ? '6px solid #000' : undefined }}
                    >
                      {stale && <div className="text-xs font-black uppercase tracking-widest bg-black text-white px-2 py-1 mb-2 -mx-1 group-hover:bg-white group-hover:text-black">Actie vereist</div>}
                      <p className="font-black text-xs uppercase tracking-tight">{lead.naam}</p>
                      {lead.email && <p className="text-xs text-gray-500 group-hover:text-gray-300 mt-0.5 truncate">{lead.email}</p>}
                      <div className="flex justify-between items-center mt-3 pt-2" style={{ borderTop: '1px solid currentColor' }}>
                        <span className="text-xs font-bold text-gray-500 group-hover:text-gray-300">{lead.bron || '—'}</span>
                        <div className="flex items-center gap-2">
                          {stale && <span className="text-xs font-bold">{dagen}d</span>}
                          {lead.prijs_voorstel && <span className="text-xs font-black">{eur(lead.prijs_voorstel)}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
