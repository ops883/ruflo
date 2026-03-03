import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { Lead } from '../types';

const router = Router();

router.get('/open', (_req: Request, res: Response) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const allLeads = db.prepare('SELECT * FROM leads ORDER BY datum_binnenkoms ASC').all() as Lead[];

  const openLeads = allLeads.filter(l =>
    (l.status === 'Offerte verstuurd' || l.status === 'Afspraak gepland') &&
    l.prijs_voorstel != null && l.prijs_voorstel > 0 &&
    l.klant_geworden !== 'Ja' && l.klant_geworden !== 'Nee'
  );

  const withDays = openLeads.map(l => {
    const dagenOpen = l.datum_binnenkoms
      ? Math.round((new Date(today).getTime() - new Date(l.datum_binnenkoms).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    return { ...l, dagenOpen };
  });

  const pipelineWaarde = openLeads.reduce((s, l) => s + (l.prijs_voorstel ?? 0), 0);

  const won = allLeads.filter(l => l.klant_geworden === 'Ja' && l.datum_binnenkoms && l.mail_tarief);
  let gemDealcyclus = 0;
  if (won.length) {
    const days = won.map(l => Math.round((new Date(l.mail_tarief!).getTime() - new Date(l.datum_binnenkoms!).getTime()) / (1000 * 60 * 60 * 24)));
    gemDealcyclus = Math.round(days.reduce((s, d) => s + d, 0) / days.length * 10) / 10;
  }

  const d14 = new Date(today); d14.setDate(d14.getDate() - 14);
  const staleLeads14 = withDays.filter(l => l.datum_binnenkoms && new Date(l.datum_binnenkoms) < d14).length;

  res.json({ openLeads: withDays, pipelineWaarde, gemDealcyclus, staleLeads14 });
});

export default router;
