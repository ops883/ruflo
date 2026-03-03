const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: res.statusText })); throw new Error(err.error || 'API fout'); }
  return res.json();
}

export const getLeads = () => request<Lead[]>('/leads');
export const createLead = (data: Partial<Lead>) => request<Lead>('/leads', { method: 'POST', body: JSON.stringify(data) });
export const updateLead = (id: number, data: Partial<Lead>) => request<Lead>(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteLead = (id: number) => request<{ success: boolean }>(`/leads/${id}`, { method: 'DELETE' });
export const getPipelineOpen = () => request<PipelineOverview>('/pipeline/open');
export const getAnalytics = () => request<AnalyticsData>('/analytics/overview');
export const getBronanalyse = () => request<BronRow[]>('/analytics/bronanalyse');
export const getKpiTargets = () => request<KpiTargetsData>('/analytics/kpi-targets');

export type LeadStatus = 'Klant' | 'Geen reactie' | 'Offerte verstuurd' | 'Contact gelegd' | 'Afspraak gepland';
export type KlantGeworden = 'Ja' | 'Nee' | '';

export interface Lead {
  id: number; naam: string; email: string; taal: 'NL' | 'EN';
  datum_binnenkoms: string | null; opvolging: string | null;
  status: LeadStatus; next_action: string;
  kennismaking: string | null; mail_tarief: string | null;
  prijs_voorstel: number | null; bron: string | null;
  klant_geworden: KlantGeworden; herinnering: string | null;
  reden_afwijzing: string | null; type_klant: string | null;
  created_at: string; updated_at: string;
}
export interface OpenLead extends Lead { dagenOpen: number; }
export interface PipelineOverview { openLeads: OpenLead[]; pipelineWaarde: number; gemDealcyclus: number; staleLeads14: number; }
export interface AnalyticsSummary {
  totalLeads: number; totalGesprekken: number; klantenGewonnen: number; geenReactie: number; openLeads: number;
  conversieLead: number; conversieGesprek: number; arrNahvLeads: number; arrEigenNetwerk: number; arrTotaal: number;
  gemOfferteprijs: number; gemArrPerKlant: number; pipelineWaarde: number; gemDagenOpvolging: number;
  medOpvolgsnelheid: number; gemDealcyclus: number; staleLeads14: number; staleLeads30: number;
  maandenActief: number; leadsPerMaand: number; klantenPerMaand: number;
}
export interface AnalyticsData { summary: AnalyticsSummary; recentLeads: Lead[]; leadsByStatus: Array<{ status: string; count: number; total_value: number }>; monthlyStats: Array<{ month: string; leads: number; revenue: number }>; }
export interface BronRow { categorie: string; aantalLeads: number; aantalKlanten: number; conversie: number; arrTotaal: number; gemArrPerKlant: number; }
export interface KpiItem { naam: string; waarde: number; eenheid: string; doel: number | null; doelLabel: string | null; richting: 'hoog' | 'laag' | null; }
export interface KpiTargetsData { kpis: KpiItem[]; funnel: Array<{ label: string; waarde: number }>; }

export const STATUS_LABELS: Record<string, string> = {
  'Klant': 'Klant', 'Geen reactie': 'Geen reactie', 'Offerte verstuurd': 'Offerte verstuurd',
  'Contact gelegd': 'Contact gelegd', 'Afspraak gepland': 'Afspraak gepland',
};
export const STATUS_COLORS: Record<string, string> = {
  'Klant': 'bg-green-100 text-green-700', 'Geen reactie': 'bg-gray-100 text-gray-500',
  'Offerte verstuurd': 'bg-purple-100 text-purple-700', 'Contact gelegd': 'bg-blue-100 text-blue-700',
  'Afspraak gepland': 'bg-yellow-100 text-yellow-700',
};
export function eur(v: number): string { return `€${v.toLocaleString('nl-NL')}`; }
export function fmtDate(d: string | null): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
}
