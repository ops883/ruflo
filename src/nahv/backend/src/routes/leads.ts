import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { Lead } from '../types';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(getDb().prepare('SELECT * FROM leads ORDER BY datum_binnenkoms DESC').all());
});

router.get('/:id', (req: Request, res: Response) => {
  const lead = getDb().prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead niet gevonden' });
  res.json(lead);
});

router.post('/', (req: Request, res: Response) => {
  const db = getDb();
  const { naam, email, taal, datum_binnenkoms, opvolging, status, next_action,
    kennismaking, mail_tarief, prijs_voorstel, bron, klant_geworden,
    herinnering, reden_afwijzing, type_klant } = req.body;
  if (!naam) return res.status(400).json({ error: 'Naam is verplicht' });
  const result = db.prepare(`
    INSERT INTO leads (naam, email, taal, datum_binnenkoms, opvolging, status, next_action,
      kennismaking, mail_tarief, prijs_voorstel, bron, klant_geworden, herinnering, reden_afwijzing, type_klant)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    naam, email || '', taal || 'NL', datum_binnenkoms || null, opvolging || null,
    status || 'Contact gelegd', next_action || '', kennismaking || null, mail_tarief || null,
    prijs_voorstel != null ? Number(prijs_voorstel) : null, bron || null, klant_geworden || '',
    herinnering || null, reden_afwijzing || null, type_klant || null);
  res.status(201).json(db.prepare('SELECT * FROM leads WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM leads WHERE id = ?').get(req.params.id) as Lead | undefined;
  if (!existing) return res.status(404).json({ error: 'Lead niet gevonden' });
  const { naam, email, taal, datum_binnenkoms, opvolging, status, next_action,
    kennismaking, mail_tarief, prijs_voorstel, bron, klant_geworden,
    herinnering, reden_afwijzing, type_klant } = req.body;
  db.prepare(`UPDATE leads SET naam=?, email=?, taal=?, datum_binnenkoms=?, opvolging=?, status=?, next_action=?,
    kennismaking=?, mail_tarief=?, prijs_voorstel=?, bron=?, klant_geworden=?,
    herinnering=?, reden_afwijzing=?, type_klant=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
    naam, email || '', taal || 'NL', datum_binnenkoms || null, opvolging || null,
    status || 'Contact gelegd', next_action || '', kennismaking || null, mail_tarief || null,
    prijs_voorstel != null ? Number(prijs_voorstel) : null, bron || null, klant_geworden || '',
    herinnering || null, reden_afwijzing || null, type_klant || null, req.params.id);
  res.json(db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  if (!db.prepare('SELECT id FROM leads WHERE id = ?').get(req.params.id))
    return res.status(404).json({ error: 'Lead niet gevonden' });
  db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
