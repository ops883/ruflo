export type LeadStatus = 'Klant' | 'Geen reactie' | 'Offerte verstuurd' | 'Contact gelegd' | 'Afspraak gepland';
export type NextAction = 'Afgerond' | 'Kennismaking' | 'Onboarden' | 'Wacht op reactie' | '';
export type Taal = 'NL' | 'EN';
export type KlantGeworden = 'Ja' | 'Nee' | '';

export interface Lead {
  id: number;
  naam: string;
  email: string;
  taal: Taal;
  datum_binnenkoms: string | null;
  opvolging: string | null;
  status: LeadStatus;
  next_action: NextAction;
  kennismaking: string | null;
  mail_tarief: string | null;
  prijs_voorstel: number | null;
  bron: string | null;
  klant_geworden: KlantGeworden;
  herinnering: string | null;
  reden_afwijzing: string | null;
  type_klant: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsSummary {
  totalLeads: number;
  totalGesprekken: number;
  klantenGewonnen: number;
  geenReactie: number;
  openLeads: number;
  conversieLead: number;
  conversieGesprek: number;
  arrNahvLeads: number;
  arrEigenNetwerk: number;
  arrTotaal: number;
  gemOfferteprijs: number;
  gemArrPerKlant: number;
  pipelineWaarde: number;
  gemDagenOpvolging: number;
  medOpvolgsnelheid: number;
  gemDealcyclus: number;
  staleLeads14: number;
  staleLeads30: number;
  maandenActief: number;
  leadsPerMaand: number;
  klantenPerMaand: number;
}

export interface BronRow {
  categorie: string;
  aantalLeads: number;
  aantalKlanten: number;
  conversie: number;
  arrTotaal: number;
  gemArrPerKlant: number;
}

export interface OpenLead extends Lead {
  dagenOpen: number;
}
