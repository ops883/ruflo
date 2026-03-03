import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { Lead } from '../types';

const router = Router();

function daysBetween(d1: string | null, d2: string | null): number | null {
  if (!d1 || !d2) return null;
  const t1 = new Date(d1).getTime();
  const t2 = new Date(d2).getTime();
  if (isNaN(t1) || isNaN(t2)) return null;
  return Math.round(Math.abs(t2 - t1) / (1000 * 60 * 60 * 24));
}

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10;
}

function categorizeBron(bron: string | null): string {
  if (!bron) return 'Onbekend';
  if (bron === 'Klant NAHV') return 'Klant NAHV';
  if (bron === 'Google') return 'Google';
  if (['AHK', 'Rietveld Academie', 'Gerrit Rietveld Academie'].includes(bron)) return 'Academie';
  if (bron === 'Pim') return 'Eigen acquisitie';
  return 'Referral/Netwerk';
}

function computeStats(allLeads: Lead[], today: string) {
  const klantenGewonnen = allLeads.filter(l => l.klant_geworden === 'Ja').length;
  const geenReactie = allLeads.filter(l => l.status === 'Geen reactie').length;
  const totalLeads = allLeads.length;
  const totalGesprekken = allLeads.filter(l =>
    l.mail_tarief !== null || (l.kennismaking !== null && l.status !== 'Geen reactie')
  ).length;

  // Open pipeline = leads where a proposal was sent or meeting is planned, not yet won/lost
  const openLeadsArr = allLeads.filter(l =>
    (l.status === 'Offerte verstuurd' || l.status === 'Afspraak gepland') &&
    l.prijs_voorstel != null && l.prijs_voorstel > 0 &&
    l.klant_geworden !== 'Ja' && l.klant_geworden !== 'Nee'
  );

  const wonLeads = allLeads.filter(l => l.klant_geworden === 'Ja');
  const arrNahvLeads = wonLeads.reduce((s, l) => s + (l.prijs_voorstel ?? 0), 0);

  const conversieLead = (totalLeads - geenReactie) > 0
    ? Math.round(klantenGewonnen / (totalLeads - geenReactie) * 100) : 0;
  const conversieGesprek = totalGesprekken > 0
    ? Math.round(klantenGewonnen / totalGesprekken * 100) : 0;
  const gemOfferteprijs = klantenGewonnen > 0 ? Math.round(arrNahvLeads / klantenGewonnen) : 0;

  const opvolgDays = allLeads
    .map(l => daysBetween(l.datum_binnenkoms, l.opvolging))
    .filter((d): d is number => d !== null);
  const gemDagenOpvolging = avg(opvolgDays);
  const sorted = [...opvolgDays].sort((a, b) => a - b);
  const medOpvolgsnelheid = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;

  const cyclusDays = wonLeads
    .map(l => daysBetween(l.datum_binnenkoms, l.mail_tarief))
    .filter((d): d is number => d !== null);
  const gemDealcyclus = avg(cyclusDays);

  const d14 = new Date(today); d14.setDate(d14.getDate() - 14);
  const d30 = new Date(today); d30.setDate(d30.getDate() - 30);
  const staleLeads14 = openLeadsArr.filter(l => l.datum_binnenkoms && new Date(l.datum_binnenkoms) < d14).length;
  const staleLeads30 = openLeadsArr.filter(l => l.datum_binnenkoms && new Date(l.datum_binnenkoms) < d30).length;

  const firstDate = allLeads.map(l => l.datum_binnenkoms).filter(Boolean).sort()[0] as string | undefined;
  let maandenActief = 4;
  if (firstDate) {
    const first = new Date(firstDate); const now = new Date(today);
    maandenActief = Math.max(1, (now.getFullYear() - first.getFullYear()) * 12 + now.getMonth() - first.getMonth() + 1);
  }

  return {
    totalLeads, totalGesprekken, klantenGewonnen, geenReactie,
    openLeadsArr, wonLeads, arrNahvLeads,
    conversieLead, conversieGesprek, gemOfferteprijs,
    gemDagenOpvolging, medOpvolgsnelheid, gemDealcyclus,
    staleLeads14, staleLeads30, maandenActief,
    leadsPerMaand: Math.round(totalLeads / maandenActief * 10) / 10,
    klantenPerMaand: Math.round(klantenGewonnen / maandenActief * 10) / 10,
  };
}

router.get('/overview', (_req: Request, res: Response) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const allLeads = db.prepare('SELECT * FROM leads ORDER BY datum_binnenkoms DESC').all() as Lead[];

  const s = computeStats(allLeads, today);
  const settingRow = db.prepare("SELECT value FROM settings WHERE key = 'eigen_netwerk_arr'").get() as { value: string } | undefined;
  const arrEigenNetwerk = settingRow ? Number(settingRow.value) : 0;
  const arrTotaal = s.arrNahvLeads + arrEigenNetwerk;

  const recentLeads = allLeads.slice(0, 5);

  const statusCounts: Record<string, { count: number; arr: number }> = {};
  for (const l of allLeads) {
    if (!statusCounts[l.status]) statusCounts[l.status] = { count: 0, arr: 0 };
    statusCounts[l.status].count++;
    statusCounts[l.status].arr += l.prijs_voorstel ?? 0;
  }
  const leadsByStatus = Object.entries(statusCounts).map(([status, v]) => ({ status, count: v.count, total_value: v.arr }));

  const monthlyMap: Record<string, { leads: number; revenue: number }> = {};
  const cutoff = new Date(today); cutoff.setMonth(cutoff.getMonth() - 6);
  for (const l of allLeads) {
    if (!l.datum_binnenkoms || new Date(l.datum_binnenkoms) < cutoff) continue;
    const month = l.datum_binnenkoms.substring(0, 7);
    if (!monthlyMap[month]) monthlyMap[month] = { leads: 0, revenue: 0 };
    monthlyMap[month].leads++;
    if (l.klant_geworden === 'Ja') monthlyMap[month].revenue += l.prijs_voorstel ?? 0;
  }
  const monthlyStats = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));

  res.json({
    summary: {
      totalLeads: s.totalLeads, totalGesprekken: s.totalGesprekken,
      klantenGewonnen: s.klantenGewonnen, geenReactie: s.geenReactie,
      openLeads: s.openLeadsArr.length,
      conversieLead: s.conversieLead, conversieGesprek: s.conversieGesprek,
      arrNahvLeads: s.arrNahvLeads, arrEigenNetwerk, arrTotaal,
      gemOfferteprijs: s.gemOfferteprijs, gemArrPerKlant: s.gemOfferteprijs,
      pipelineWaarde: s.openLeadsArr.reduce((sum, l) => sum + (l.prijs_voorstel ?? 0), 0),
      gemDagenOpvolging: s.gemDagenOpvolging, medOpvolgsnelheid: s.medOpvolgsnelheid,
      gemDealcyclus: s.gemDealcyclus,
      staleLeads14: s.staleLeads14, staleLeads30: s.staleLeads30,
      maandenActief: s.maandenActief, leadsPerMaand: s.leadsPerMaand, klantenPerMaand: s.klantenPerMaand,
    },
    recentLeads,
    leadsByStatus,
    monthlyStats,
  });
});

router.get('/bronanalyse', (_req: Request, res: Response) => {
  const db = getDb();
  const allLeads = db.prepare('SELECT * FROM leads').all() as Lead[];

  const cats: Record<string, { leads: number; klanten: number; arr: number }> = {};
  for (const l of allLeads) {
    const cat = categorizeBron(l.bron);
    if (!cats[cat]) cats[cat] = { leads: 0, klanten: 0, arr: 0 };
    cats[cat].leads++;
    if (l.klant_geworden === 'Ja') { cats[cat].klanten++; cats[cat].arr += l.prijs_voorstel ?? 0; }
  }

  const ORDER = ['Klant NAHV', 'Google', 'Academie', 'Referral/Netwerk', 'Eigen acquisitie', 'Onbekend'];
  const result = ORDER.filter(cat => cats[cat]).map(cat => ({
    categorie: cat,
    aantalLeads: cats[cat].leads,
    aantalKlanten: cats[cat].klanten,
    conversie: cats[cat].leads > 0 ? Math.round(cats[cat].klanten / cats[cat].leads * 100) : 0,
    arrTotaal: cats[cat].arr,
    gemArrPerKlant: cats[cat].klanten > 0 ? Math.round(cats[cat].arr / cats[cat].klanten) : 0,
  }));

  res.json(result);
});

router.get('/kpi-targets', (_req: Request, res: Response) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const allLeads = db.prepare('SELECT * FROM leads').all() as Lead[];
  const s = computeStats(allLeads, today);
  const settingRow = db.prepare("SELECT value FROM settings WHERE key = 'eigen_netwerk_arr'").get() as { value: string } | undefined;
  const arrEigenNetwerk = settingRow ? Number(settingRow.value) : 0;
  const arrTotaal = s.arrNahvLeads + arrEigenNetwerk;

  const kpis = [
    { naam: 'Conversie (lead→klant)', waarde: s.conversieLead, eenheid: '%', doel: 70, doelLabel: '≥70%', richting: 'hoog' },
    { naam: 'Conversie (gesprek→klant)', waarde: s.conversieGesprek, eenheid: '%', doel: 80, doelLabel: '≥80%', richting: 'hoog' },
    { naam: 'Gem. offerteprijs', waarde: s.gemOfferteprijs, eenheid: '€', doel: 750, doelLabel: '≥€750', richting: 'hoog' },
    { naam: 'Gem. ARR per klant', waarde: s.gemOfferteprijs, eenheid: '€', doel: 700, doelLabel: '≥€700', richting: 'hoog' },
    { naam: 'ARR totaal', waarde: arrTotaal, eenheid: '€', doel: 50000, doelLabel: '≥€50.000', richting: 'hoog' },
    { naam: 'Gem. opvolgsnelheid', waarde: s.gemDagenOpvolging, eenheid: 'd', doel: 1, doelLabel: '<1 dag', richting: 'laag' },
    { naam: 'Gem. dealcyclus', waarde: s.gemDealcyclus, eenheid: 'd', doel: 14, doelLabel: '<14 dagen', richting: 'laag' },
    { naam: 'Klanten per maand', waarde: s.klantenPerMaand, eenheid: '', doel: 4, doelLabel: '>4', richting: 'hoog' },
    { naam: 'Klanten gewonnen', waarde: s.klantenGewonnen, eenheid: '', doel: null, doelLabel: null, richting: null },
    { naam: 'Open leads', waarde: s.openLeadsArr.length, eenheid: '', doel: null, doelLabel: null, richting: null },
    { naam: 'Geen reactie leads', waarde: s.geenReactie, eenheid: '', doel: 0, doelLabel: '0', richting: 'laag' },
    { naam: 'Stale leads >14d', waarde: s.staleLeads14, eenheid: '', doel: 0, doelLabel: '0', richting: 'laag' },
    { naam: 'Stale leads >30d', waarde: s.staleLeads30, eenheid: '', doel: 0, doelLabel: '0', richting: 'laag' },
  ];

  const funnel = [
    { label: 'Leads', waarde: s.totalLeads },
    { label: 'Gesprekken', waarde: s.totalGesprekken },
    { label: 'Klanten', waarde: s.klantenGewonnen },
    { label: 'Open', waarde: s.openLeadsArr.length },
  ];

  res.json({ kpis, funnel });
});

export default router;
