import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'nahv.db');

let sqlDb: SqlJsDatabase | null = null;

interface RunResult { lastInsertRowid: number; changes: number; }
interface PreparedStatement {
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
  run(...params: unknown[]): RunResult;
}
export interface DbWrapper {
  prepare(sql: string): PreparedStatement;
  exec(sql: string): void;
  pragma(str: string): void;
}

function save(): void {
  if (!sqlDb) return;
  const data = sqlDb.export();
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function createWrapper(db: SqlJsDatabase): DbWrapper {
  return {
    prepare(sql: string): PreparedStatement {
      return {
        get(...params: unknown[]) {
          const stmt = db.prepare(sql);
          stmt.bind(params.length ? params as any : undefined);
          if (stmt.step()) { const row = stmt.getAsObject(); stmt.free(); return row as Record<string, unknown>; }
          stmt.free(); return undefined;
        },
        all(...params: unknown[]) {
          const stmt = db.prepare(sql);
          if (params.length) stmt.bind(params as any);
          const results: Record<string, unknown>[] = [];
          while (stmt.step()) results.push(stmt.getAsObject() as Record<string, unknown>);
          stmt.free(); return results;
        },
        run(...params: unknown[]) {
          db.run(sql, params as any);
          const lastId = (db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] ?? 0) as number;
          const changes = db.getRowsModified();
          save();
          return { lastInsertRowid: lastId, changes };
        },
      };
    },
    exec(sql: string) { db.run(sql); save(); },
    pragma(_s: string) { /* no-op */ },
  };
}

let dbWrapper: DbWrapper | null = null;
let initPromise: Promise<DbWrapper> | null = null;

async function initDb(): Promise<DbWrapper> {
  const SQL = await initSqlJs();
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  sqlDb = fs.existsSync(DB_PATH) ? new SQL.Database(fs.readFileSync(DB_PATH)) : new SQL.Database();
  const wrapper = createWrapper(sqlDb);
  initSchema(wrapper);
  dbWrapper = wrapper;
  return wrapper;
}

export function getDbAsync(): Promise<DbWrapper> {
  if (dbWrapper) return Promise.resolve(dbWrapper);
  if (!initPromise) initPromise = initDb();
  return initPromise;
}

export function getDb(): DbWrapper {
  if (!dbWrapper) throw new Error('Database not initialized.');
  return dbWrapper;
}

export async function initDatabase(): Promise<void> { await getDbAsync(); }

function initSchema(db: DbWrapper): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      naam TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      taal TEXT NOT NULL DEFAULT 'NL',
      datum_binnenkoms TEXT,
      opvolging TEXT,
      status TEXT NOT NULL DEFAULT 'Contact gelegd',
      next_action TEXT NOT NULL DEFAULT '',
      kennismaking TEXT,
      mail_tarief TEXT,
      prijs_voorstel REAL,
      bron TEXT,
      klant_geworden TEXT NOT NULL DEFAULT '',
      herinnering TEXT,
      reden_afwijzing TEXT,
      type_klant TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )
  `);

  seedDefaultData(db);
}

function seedDefaultData(db: DbWrapper): void {
  const row = db.prepare('SELECT COUNT(*) as count FROM leads').get();
  if ((row as { count: number }).count > 0) return;

  // Seed eigen netwerk ARR (external revenue not tracked in CRM)
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('eigen_netwerk_arr', '8350')").run();

  const ins = db.prepare(`
    INSERT INTO leads (naam, email, taal, datum_binnenkoms, opvolging, status, next_action,
      kennismaking, mail_tarief, prijs_voorstel, bron, klant_geworden, herinnering, reden_afwijzing, type_klant)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const leads: [string,string,string,string|null,string|null,string,string,string|null,string|null,number|null,string|null,string,string|null,string|null,string|null][] = [
    ['Elio Carranza','eliojcarranza@posteo.de','EN','2025-11-05','2025-11-12','Klant','Afgerond','2026-01-06','2026-01-06',600,'Rietveld Academie','Ja',null,null,'Starter'],
    ['Judith Francke','jfrancke1722@gmail.com','EN','2025-11-20','2025-11-20','Klant','Afgerond','2025-12-01','2025-12-01',450,'Klant NAHV','Ja',null,null,'Starter'],
    ['Kino Haverkorn','kinohaverkorn@gmail.com','NL','2025-11-20','2025-11-20','Klant','Afgerond','2025-11-20','2025-11-20',1200,'Klant NAHV','Ja',null,null,'Tijdelijk'],
    ['Brynn Guntermann','hello@bumblebrynn.com','EN','2025-12-07','2025-12-08','Klant','Afgerond','2026-01-08','2026-01-08',600,'Google','Ja',null,null,'Starter'],
    ['Carli van \'t Schip','info@frisseplannen.nl','NL','2025-12-11','2025-12-11','Klant','Afgerond',null,'2026-01-08',550,'Klant NAHV','Ja',null,null,'Groeiend'],
    ['Bas van Waard','dedansendetijger@gmail.com','NL','2025-12-11','2025-12-11','Klant','Afgerond','2025-12-11','2025-12-11',600,'Domien Marlet','Ja','18-02-2026 contact gehad',null,'Creatief'],
    ['Vyvy Ly','vyvyly.nl@gmail.com','NL','2025-12-11','2025-12-12','Klant','Afgerond','2025-12-12','2025-12-12',600,'Google','Ja',null,null,'Expat'],
    ['Jazzy van Wersch','jazzy.van.wersch@hotmail.com','NL','2025-12-15','2025-12-15','Geen reactie','Kennismaking',null,null,750,'AHK',''  ,null,'No Show','Creatief'],
    ['Nina Miege','miege.nina@gmail.com','NL','2025-12-15',null,'Geen reactie','',null,null,750,'AHK','','2-2-2026 verstuurd','Geen reactie',null],
    ['Sara Abbott','thornblackbird@gmail.com','EN','2025-12-15','2025-12-22','Klant','Afgerond','2025-12-30','2025-12-30',900,'Everaert Advocaten','Ja',null,null,'Expat'],
    ['Jonathan Connell','jonathanpconnell@gmail.com','EN','2025-12-16','2025-12-16','Klant','Afgerond','2025-12-19','2025-12-19',750,'Partner klant','Ja',null,null,'Partner'],
    ['Mayya Kuznetsova','happy2000maya@gmail.com','EN','2025-12-22','2026-01-16','Klant','Afgerond','2026-01-16','2026-01-16',650,'Gerrit Rietveld Academie','Ja',null,null,'Creatief'],
    ['Sophie Ehling','sophie.ehling@gmail.com','NL','2025-12-29','2025-12-29','Klant','Afgerond','2026-01-09','2025-12-30',750,'Klant NAHV','Ja',null,null,'Creatief'],
    ['Hans Vermeulen','hans@theworks.tv','NL','2026-01-05','2026-01-06','Klant','Afgerond',null,'2026-01-08',1710,'Website','Ja',null,null,'Tv producent'],
    ['Nataliya Zuban','nata.zuban@gmail.com','NL','2026-01-07','2026-01-07','Klant','Afgerond','2026-01-08','2026-01-08',600,'KraftHeinz','Ja',null,null,'Creatief'],
    ['Amol Patil','1987patil@gmail.com','EN','2026-01-07','2026-01-07','Klant','Afgerond','2026-01-08','2026-01-08',1050,'KraftHeinz','Ja',null,null,'Creatief'],
    ['Anders Fischer','anders@fischerconsulting.se','EN','2026-01-12','2026-01-12','Klant','Afgerond','2026-01-13','2026-01-13',750,'Christian Riege','Ja',null,null,'Consultant'],
    ['Bidisha Chaudhuri','bidisha.india@googlemail.com','EN','2026-01-12','2026-01-12','Klant','Afgerond','2026-01-16','2026-01-12',500,'Annet Dekker','Ja',null,null,'High knowledge worker'],
    ['Sumit Floyd','sumitfloyd@gmail.com','EN','2026-01-12','2026-01-16','Klant','Afgerond','2026-01-16','2026-01-16',500,'Annet Dekker','Ja',null,null,'High knowledge worker'],
    ['Aliki Giannikou','algiannikou@outlook.com.gr','NL','2026-01-20','2026-01-21','Geen reactie','Kennismaking',null,null,750,'Theodoros Orfanidis','','3-2-2026 verstuurd',null,'Leraar'],
    ['Do Groen','do@horseswithchoices.com','NL','2026-01-26','2026-01-26','Klant','Onboarden','2026-02-05','2026-02-04',750,'Journalist association','Ja',null,null,'Paardencoach'],
    ['Valery Molay','valery.molay@gmail.com','EN','2026-02-06','2026-02-06','Offerte verstuurd','Afgerond','2026-02-10','2026-02-10',750,'Journalist association','','18-02-2026 verstuurd','BH met DBA ervaring','Klimaat expert'],
    ['Jacquill G. Basdew','(LinkedIn)','NL','2026-02-04','2026-02-04','Contact gelegd','Kennismaking',null,null,null,'Pim','',null,'Beleids medewerker museum',null],
    ['Bart Visser','(LinkedIn)','NL','2026-02-10','2026-02-10','Contact gelegd','Kennismaking',null,null,null,'Pim','',null,'Editor tv series',null],
    ['Celine Fassone','celly5401@gmail.com','EN','2026-02-12','2026-02-12','Offerte verstuurd','Wacht op reactie','2026-02-12','2026-02-12',750,'Ryan Donovan','',null,null,'IT'],
    ['Mascha Guspavs','Gustavs.design@gmail.com','NL','2026-02-12',null,'Contact gelegd','Kennismaking',null,null,750,null,'',null,null,null],
    ['Oskar Brink','Oskar@oskarbrinkconsulting.nl','NL','2026-02-19','2026-02-19','Offerte verstuurd','Afgerond','2026-02-20','2026-02-20',600,'Freek','Nee',null,'BH dichter bij huis',null],
    ['Daniel Carter','daniel@allcarters.com','EN','2026-02-23','2026-02-23','Offerte verstuurd','Wacht op reactie','2026-02-24','2026-02-27',20500,'Americans Overseas','',null,null,null],
    ['Andreea Flutur','aflutur1@gmail.com','EN','2026-02-25','2026-02-25','Afspraak gepland','Kennismaking','2026-03-12','2026-03-12',null,'Americans Overseas','',null,null,null],
    ['Amanda Sharp','amanda.sharp@id8business.com','EN','2026-02-26','2026-02-26','Afspraak gepland','Kennismaking','2026-02-27','2026-02-27',7500,'Americans Overseas','',null,null,null],
    ['Ivar Frisch','ivarfrisch@gmail.com','NL','2026-02-27',null,'Contact gelegd','Kennismaking',null,null,750,null,'',null,null,null],
  ];

  for (const row of leads) {
    ins.run(...row);
  }
}
