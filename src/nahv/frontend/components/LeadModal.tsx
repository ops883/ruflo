'use client';
import { useState, useEffect } from 'react';
import { Lead, createLead, updateLead, STATUS_LABELS } from '../lib/api';

interface Props {
  lead: Lead | null;
  onClose: () => void;
  onSaved: (lead: Lead) => void;
}

const STATUSES = Object.keys(STATUS_LABELS) as Lead['status'][];
const BRONNEN = ['Website', 'Google', 'LinkedIn', 'Klant NAHV', 'Referral', 'Academie', 'Americans Overseas', 'Journalist association', 'Anders'];
const TYPES = ['Starter', 'Groeiend', 'Creatief', 'Expat', 'Partner', 'Consultant', 'BV/DGA', 'Tijdelijk', 'High knowledge worker', 'Tv producent', 'Paardencoach', 'Klimaat expert', 'IT'];
const NEXT_ACTIONS = ['Kennismaking', 'Offerte maken', 'Wacht op reactie', 'Afgerond', 'Onboarden', ''];

export default function LeadModal({ lead, onClose, onSaved }: Props) {
  const isEdit = Boolean(lead);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    naam: '', email: '', taal: 'NL' as 'NL' | 'EN',
    datum_binnenkoms: '', opvolging: '', status: 'Contact gelegd' as Lead['status'],
    next_action: '', kennismaking: '', mail_tarief: '',
    prijs_voorstel: '', bron: '', klant_geworden: '' as Lead['klant_geworden'],
    herinnering: '', reden_afwijzing: '', type_klant: '',
  });

  useEffect(() => {
    if (lead) {
      setForm({
        naam: lead.naam || '',
        email: lead.email || '',
        taal: lead.taal || 'NL',
        datum_binnenkoms: lead.datum_binnenkoms || '',
        opvolging: lead.opvolging || '',
        status: lead.status || 'Contact gelegd',
        next_action: lead.next_action || '',
        kennismaking: lead.kennismaking || '',
        mail_tarief: lead.mail_tarief || '',
        prijs_voorstel: lead.prijs_voorstel != null ? String(lead.prijs_voorstel) : '',
        bron: lead.bron || '',
        klant_geworden: lead.klant_geworden || '',
        herinnering: lead.herinnering || '',
        reden_afwijzing: lead.reden_afwijzing || '',
        type_klant: lead.type_klant || '',
      });
    }
  }, [lead]);

  function set(field: string, value: string) { setForm(f => ({ ...f, [field]: value })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        ...form,
        prijs_voorstel: form.prijs_voorstel ? parseFloat(form.prijs_voorstel) : null,
        datum_binnenkoms: form.datum_binnenkoms || null,
        opvolging: form.opvolging || null,
        kennismaking: form.kennismaking || null,
        mail_tarief: form.mail_tarief || null,
        bron: form.bron || null,
        herinnering: form.herinnering || null,
        reden_afwijzing: form.reden_afwijzing || null,
        type_klant: form.type_klant || null,
      };
      const saved = isEdit ? await updateLead(lead!.id, payload) : await createLead(payload);
      onSaved(saved);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fout bij opslaan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-2xl border-2 border-black max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-5 bg-black text-white sticky top-0">
          <h2 className="text-sm font-black uppercase tracking-widest">{isEdit ? 'Lead Bewerken' : 'Nieuwe Lead'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white font-bold text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5">
          {error && (
            <div className="border-2 border-black p-3 bg-black text-white text-xs font-bold uppercase tracking-widest">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Naam *</label>
              <input className="input" value={form.naam} onChange={e => set('naam', e.target.value)} required placeholder="Volledige naam" />
            </div>
            <div>
              <label className="label">E-mail</label>
              <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="naam@domein.nl" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Taal</label>
              <select className="input" value={form.taal} onChange={e => set('taal', e.target.value)}>
                <option value="NL">NL</option>
                <option value="EN">EN</option>
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Klant geworden</label>
              <select className="input" value={form.klant_geworden} onChange={e => set('klant_geworden', e.target.value)}>
                <option value="">In behandeling</option>
                <option value="Ja">Ja</option>
                <option value="Nee">Nee</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Datum Binnenkomst</label>
              <input className="input" type="date" value={form.datum_binnenkoms} onChange={e => set('datum_binnenkoms', e.target.value)} />
            </div>
            <div>
              <label className="label">Datum Opvolging</label>
              <input className="input" type="date" value={form.opvolging} onChange={e => set('opvolging', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Kennismaking</label>
              <input className="input" type="date" value={form.kennismaking} onChange={e => set('kennismaking', e.target.value)} />
            </div>
            <div>
              <label className="label">Mail tarief verstuurd</label>
              <input className="input" type="date" value={form.mail_tarief} onChange={e => set('mail_tarief', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Prijs voorstel (€)</label>
              <input className="input" type="number" min="0" value={form.prijs_voorstel} onChange={e => set('prijs_voorstel', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="label">Next action</label>
              <select className="input" value={form.next_action} onChange={e => set('next_action', e.target.value)}>
                <option value="">—</option>
                {NEXT_ACTIONS.filter(Boolean).map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Bron</label>
              <select className="input" value={form.bron} onChange={e => set('bron', e.target.value)}>
                <option value="">— Selecteer bron —</option>
                {BRONNEN.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Type klant</label>
              <select className="input" value={form.type_klant} onChange={e => set('type_klant', e.target.value)}>
                <option value="">—</option>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Herinnering / notitie</label>
            <input className="input" value={form.herinnering} onChange={e => set('herinnering', e.target.value)} placeholder="Bijv. 18-02 contact gehad" />
          </div>

          <div>
            <label className="label">Reden afwijzing</label>
            <input className="input" value={form.reden_afwijzing} onChange={e => set('reden_afwijzing', e.target.value)} placeholder="Bijv. BH dichter bij huis" />
          </div>

          <div className="flex gap-3 pt-2" style={{ borderTop: '2px solid #000' }}>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Opslaan...' : isEdit ? 'Wijzigingen opslaan' : 'Lead aanmaken'}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>Annuleer</button>
          </div>
        </form>
      </div>
    </div>
  );
}
