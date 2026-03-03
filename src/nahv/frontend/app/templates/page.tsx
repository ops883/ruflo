'use client';
import { useState } from 'react';

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <button onClick={copy} className="btn-secondary text-xs px-3 py-1.5 absolute bottom-3 right-3">
      {copied ? '✓ Gekopieerd' : 'Kopieer'}
    </button>
  );
}

function Template({ id, label, content }: { id: string; label: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-black">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex justify-between items-center px-4 py-3 bg-gray-50 hover:bg-black hover:text-white text-left"
      >
        <span className="text-xs font-bold uppercase tracking-widest">{label}</span>
        <span className="text-xs font-bold">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="p-4 relative" style={{ borderTop: '1px solid #000' }}>
          <textarea
            id={id}
            readOnly
            className="w-full text-xs text-gray-700 bg-transparent border-none resize-none outline-none leading-relaxed font-mono"
            rows={content.split('\n').length + 1}
            value={content}
          />
          <CopyBtn text={content} />
        </div>
      )}
    </div>
  );
}

const STAPPEN = [
  {
    num: 1,
    title: 'Binnenkomst via kanaal',
    desc: 'Lead komt binnen via de website of een ander kanaal.',
    templates: [],
  },
  {
    num: 2,
    title: 'Secretariaat pakt op',
    desc: 'Secretariaat zet in lijst en stuurt standaard mail.',
    templates: [],
  },
  {
    num: 3,
    title: 'Herverdeling vennoot',
    desc: 'De vennoot beoordeelt de lead globaal en verdeelt.',
    templates: [],
  },
  {
    num: 4,
    title: 'Toewijzing',
    desc: 'Toegewezen aan relatiebeheerder of assistent.',
    templates: [],
  },
  {
    num: 5,
    title: 'Inplannen Kennismaking',
    desc: 'Inplannen kennismaking door relatiebeheerder op basis van template. Pro-tip: stuur direct twee concrete datum/tijd opties mee.',
    templates: [
      {
        id: 'tpl-ken', label: 'Mail kennismaking (NL & EN)',
        content: `Beste …,

Leuk dat je interesse hebt om klant te worden bij NAHV! Ik maak graag kennis om te bespreken hoe we je kunnen helpen. Dat kan bij ons op kantoor en er zitten geen kosten aan verbonden.

Zou een van de onderstaande momenten voor jou passen?
• Dinsdag 6 januari van 14:00 tot 15:00
• Donderdag 8 januari van 11:00 tot 12:00

Laat maar weten wat je voorkeur heeft, dan plan ik de afspraak in.

---

Dear …,

Nice to hear that you're interested in becoming a client of NAHV. I'd be happy to get to know each other and discuss how we can support you. We can meet at our office, and the introduction is free of charge.

Would one of the following time slots work for you?
• Tuesday, January 6, from 2:00 to 3:00 PM
• Thursday, January 8, from 11:00 AM to 12:00 PM

Let me know what works best for you, and I'll schedule the appointment.`,
      },
      {
        id: 'tpl-rem-afs', label: 'Reminder afspraak inplannen',
        content: `Beste [Naam],

Onlangs heb ik je een bericht gestuurd over het inplannen van een kennismaking bij NAHV. Ik was benieuwd of je hier nog interesse in hebt.

Als je het prettig vindt, plannen we graag een korte kennismaking in (op kantoor of online) om te bespreken hoe we je kunnen helpen. Laat gerust weten wat voor jou uitkomt, dan kijk ik mee in de agenda.

---

Dear [Name],

I recently sent you a message about scheduling an introductory meeting with NAHV. I just wanted to check whether you are still interested.

If so, we would be happy to plan a short introduction (either at our office or online) to discuss how we can support you. Let me know what suits you, and I'll take care of the scheduling.`,
      },
      {
        id: 'tpl-koude', label: 'Lead template (Koude intro / Netwerk)',
        content: `Hey [naam],

Hoe gaat ie? Lang geleden!

Ik werk sinds vorig jaar bij NAHV Belastingadviseurs. We helpen ondernemers met hun financiën — belastingaangifte, pensioen, dat soort zaken.

Ik dacht aan je omdat [je een eigen zaak hebt / je zzp'er bent]. Geen idee of je al goed zit qua adviseur, maar mocht je ooit ergens tegenaan lopen of gewoon eens willen sparren — laat gerust weten.

Hoe is het verder met je?
Groet,
[Jouw naam]`,
      },
    ],
  },
  {
    num: 6,
    title: 'Achtergrond klant doornemen',
    desc: 'Bekijk de bedrijfswebsite, controleer KVK gegevens, zoek de contactpersoon op via LinkedIn.',
    templates: [],
  },
  {
    num: 7,
    title: 'Standaard script aanpassen',
    desc: 'Pas het standaard gespreksscript aan op basis van de specifieke klantbehoefte en details.',
    templates: [],
  },
  {
    num: 8,
    title: 'Kennismaking via Teams',
    desc: 'Voer de kennismaking uit op basis van het script. Opnemen in Teams mag voor een transcript. Laat de klant 70% van de tijd praten.',
    templates: [
      {
        id: 'tpl-gesprek', label: 'Template Gesprek / Vragenlijst',
        content: `Welkom & Kennismaking (5 min)
Introductie van jezelf en NAHV: "Wij zijn fiscalisten en belastingadviseurs, geen standaard boekhouders. Wij denken echt met je mee..."

Huidige situatie (10-15 min)
- Wat doe je precies met je bedrijf?
- Hoe is je bedrijfsstructuur nu geregeld (Eenmanszaak, BV, Holding)?
- Werk je internationaal of heb je US connecties?
- Wie doet momenteel je aangiftes en administratie?
- Welk boekhoudpakket gebruik je (bijv. Moneybird, Exact)?

Pijnpunten & Behoeftes (5 min)
- Waar loop je nu tegenaan? (bijv. weinig proactief advies, trage communicatie)

Wat wij kunnen betekenen (5 min)
- Onze visie op ontzorging
- Uitleg abonnement vs uurtje-factuurtje

Vervolgstappen (5 min)
- Voorstel volgt na dit gesprek
- Check voor vragen`,
      },
    ],
  },
  {
    num: 9,
    title: 'Standaard template voorstel aanpassen',
    desc: 'Werk het voorstel uit op basis van het gesprek (transcript). Check: KVK gecheckt, UBO formulier verstuurd, calculator bedrag afgestemd.',
    templates: [
      {
        id: 'tpl-prijs-ind', label: 'Mail Prijs Indicatie',
        content: `Beste {{naam}},

Dank voor je bericht.

Hierbij alvast een indicatie van onze tarieven. Voor een eenmanszaak liggen de jaarlijkse kosten doorgaans tussen de €750 en €950 exclusief btw, afhankelijk van de omvang en complexiteit van de administratie.

Dit bedrag is inclusief:
- het controleren en verwerken van de administratie
- het verzorgen van de btw-aangiftes
- het opstellen van de jaarcijfers
- het indienen van de inkomstenbelasting (voor jou en eventueel je fiscale partner)

In het eerste jaar kunnen de kosten iets hoger uitvallen, bijvoorbeeld wanneer we de administratie van een vorig kantoor overnemen of extra moeten opschonen.

Op [datum] kunnen we online kennismaken om jouw situatie kort door te nemen. Op basis daarvan kan ik aangeven welk tarief in jouw geval het meest passend is.`,
      },
      {
        id: 'tpl-voorstel', label: 'Template Voorstel (Hoofd Voorstel NL)',
        content: `Hi {{naam}},

Leuk je eerder gesproken te hebben! Zoals beloofd stuur ik je hierbij een kort overzicht van onze diensten, een indicatie van de kosten en hoe we de overgang soepel kunnen laten verlopen.

Onze diensten
Wij zijn aangesloten bij het Register Belastingadviseurs (RB) en werken met een vier-ogenprincipe bij alle aangiftes om de kwaliteit te waarborgen.

Wij kunnen je ondersteunen bij:
- btw-aangiftes
- aangiftes inkomstenbelasting (voor jou en je partner)
- boekhouding (controle administratie, opstellen jaarstukken)
- algemeen financieel advies via onze gespecialiseerde collega's

Kostenindicatie
Voor de onderstaande werkzaamheden rekenen we op jaarbasis op circa €{{tarief}} exclusief btw:
- controle van de administratie en indienen van de btw-aangiftes
- opstellen van de jaarstukken
- indienen van de aangiftes inkomstenbelasting

Let op: in het eerste jaar kunnen de kosten iets hoger uitvallen in verband met het inwerken en overnemen van gegevens.

Vervolgstappen
Om de overstap in gang te zetten, ontvang ik graag een reactie of je akkoord gaat. Dan plannen we de volgende stap.

Met vriendelijke groet,
Pim Holthof`,
      },
      {
        id: 'tpl-voorstel-en', label: 'Template Voorstel (Hoofd Voorstel EN)',
        content: `Hi {{naam}},

It was nice speaking with you earlier. As promised, below you'll find a summary of what we discussed and a cost indication.

Scope of services
We can support you with:
- Quarterly VAT returns (including ICP reporting where applicable)
- Review of your administration (invoices/expenses/receipts)
- Preparation of the annual financial statements
- Filing of the annual income tax return

Cost indication
Based on your situation as discussed, the annual fee is estimated at €{{tarief}} excl. VAT.

This includes:
- Reviewing your administration
- Submitting VAT returns and ICP reporting
- Preparing the annual financial statements
- Filing the annual income tax return

If you confirm your agreement, I will send you a short onboarding checklist.

Best regards,
Pim Holthof`,
      },
    ],
  },
  {
    num: 10,
    title: 'Lead lijst bijwerken',
    desc: 'Lead lijst bijwerken obv voorstel en mail. Status → Offerte verstuurd.',
    templates: [],
  },
  {
    num: 11,
    title: 'Reminder versturen',
    desc: 'Verstuur een herinnering indien we na een week nog niks hebben gehoord.',
    templates: [
      {
        id: 'tpl-rem-voor', label: 'Template Reminder Voorstel',
        content: `Hey {{naam}},

Ik hoop dat je een goede week hebt gehad. Ik was even benieuwd of je al tijd had gevonden om naar ons voorstel te kijken?

Mocht je ergens vragen over hebben, of wellicht nog over willen sparren, voel je vrij om even te bellen. Of anders via WhatsApp/Email.

Zo niet, dan wens ik je sowieso veel succes toe met je onderneming, en wellicht in de toekomst!`,
      },
    ],
  },
  {
    num: 12,
    title: 'Akkoord of niet',
    desc: 'Registreer de uitslag. Bij een afwijzing gebruiken we onderstaande mail.',
    templates: [
      {
        id: 'tpl-afwijzing', label: 'Afwijzing (Door klant) NL/EN',
        content: `Beste {{naam}},

Dank voor je bericht en de toelichting. Ik begrijp je keuze heel goed.

Voor nu dank voor de update en heel veel succes gewenst de komende jaren. Mocht je in de toekomst toch nog een second opinion of fiscale hulp zoeken, dan weet je ons te vinden.

---

Dear {{naam}},

Thank you for your message and for letting me know.

I completely understand. While it's a pity we won't be working together, I wish you the very best of luck with your new venture.

If you ever need a second opinion or tax assistance in the future, please feel free to reach out.`,
      },
    ],
  },
  {
    num: 13,
    title: 'Onboarding',
    desc: 'Als de klant akkoord is, verzamelen we gegevens en stellen we de accountomgeving in.',
    templates: [
      {
        id: 'tpl-onb-welkom', label: 'Onboarding Template Klant (Welkom) NL/EN',
        content: `Hi {{naam}},

Leuk dat we vanaf [datum] voor je aan de slag gaan.

Zou je het formulier in de bijlage willen invullen en aan mij willen terugsturen? De code is 0902. Zodra ik dit heb ontvangen, kunnen we je definitief als klant aanmelden en alles inrichten.

De volgende stap in de onboarding loopt via ons secretariaat. Zij nemen binnenkort contact met je op om een paar praktische zaken te regelen, zoals:
- identificatie
- het aanvragen van de benodigde machtigingen bij de Belastingdienst

Zodra dit is afgerond, kunnen wij de aangiftes voor je verzorgen en inhoudelijk aan de slag.

---

Hi {{naam}},

Great to start working for you from [date].

Could you please complete the form attached and send it back to me? The code is 0902. Once I've received this, we can register you as a client and set everything up.

The next step in the onboarding process will be handled by our administration team. They will contact you shortly to arrange:
- identification
- applying for the required authorisations with the Dutch Tax Authorities

If you have any questions in the meantime, feel free to let me know.`,
      },
      {
        id: 'tpl-onb-intern', label: 'Onboarding Stappen Intern (AFAS)',
        content: `Interne onboarding checklist:
- Relatiekaart AFAS incl vrijevelden (Accountmanager, Soort relatie, factuur aan relatie, abonnementeind/start)
- UBO en aandelen in tabblad eigenschappen
- KvK Uittreksel bijschrijven in dossier als dossieritem (Type = KvK)
- Identiteitsbewijs in dossier als dossieritem (Type = ID check, BRP afschermen incl foto)
- Portaal uitnodiging versturen`,
      },
    ],
  },
  {
    num: 14,
    title: 'Periodieke Werkzaamheden & Extra Templates',
    desc: 'Templates voor terugkerende taken zoals btw-aangiftes, voorlopige aanslagen en overdracht.',
    templates: [
      {
        id: 'tpl-btw', label: 'BTW Aangifte Standaard Mail (EN)',
        content: `Subject: VAT declaration 4th quarter 2024

Enclosed I send you the VAT declaration for the 4th quarter 2024.

To be paid: € 97,-
Payment reference: 3516 1077 8150 1300
Bank account number: NL86 INGB 0002 4455 88 in the name of Belastingdienst, Apeldoorn.

Perhaps unnecessarily, I mention that the amount must be in the account of the tax authorities no later than January 31, 2025.

I enclose the VAT declaration as a PDF.`,
      },
      {
        id: 'tpl-va', label: 'Voorlopige Aanslag (VA)',
        content: `Beste {{naam}},

Namens [collega] heb ik je voorlopige aanslag voor 2025 bekeken. Vooralsnog is er bij ons geen voorlopige aanslag bekend.

Op basis van de btw-cijfers kom ik uit op een geschatte winst van ongeveer €65.000. Klopt dit ongeveer? Daaruit volgt de volgende schatting voor de te betalen bedragen:
- IB/PVV: ca. €12.803
- ZVW Bijdrage: ca. €2.699

Houd er rekening mee dat dit een ruwe schatting is.

Heb je een andere winstverwachting? Dan kunnen we de voorlopige aanslag daarop aanpassen.

Ik hoor graag wat je voorkeur heeft:
Ik kan alvast de voorlopige aanslag (VA) indienen, zodat je in termijnen kunt betalen en belastingrente (circa 6,5%) kunt voorkomen. Of we wachten met indienen tot komend jaar.

Let op: als de aangifte ná 1 april wordt ingediend, is belastingrente onvermijdelijk.`,
      },
      {
        id: 'tpl-aangenaam', label: 'Overdracht Contactpersoon NL/EN',
        content: `Beste {{naam}},

Via mijn collega heb je al gehoord dat zij NAHV gaat verlaten en dat ik jullie contactpersoon word. Mijn naam is [Jouw naam] en ik neem het contact over van [Naam collega].

Als je vragen hebt of even kennis wil maken, kun je me gerust mailen of bellen.

---

Dear {{naam}},

You have already been informed by my colleague that he is leaving NAHV and that I will be your contact person going forward.

My name is [Your name]. I will be taking over from [Colleague's name] and will make sure everything continues to run smoothly.

If you have any questions, feel free to email or call me.`,
      },
    ],
  },
];

export default function TemplatesPage() {
  return (
    <div className="p-10 max-w-4xl pb-20">
      <div className="mb-10">
        <h2 className="text-3xl font-black tracking-tighter">Werkwijze & Templates</h2>
        <p className="text-sm text-gray-500 mt-1 font-medium">Het 14-stappen lead management proces inclusief standaard templates.</p>
      </div>

      <div className="space-y-0">
        {STAPPEN.map((stap, i) => (
          <div key={stap.num} className="flex gap-5 relative pb-6">
            {/* Line */}
            {i < STAPPEN.length - 1 && (
              <div className="absolute left-5 top-10 bottom-0 w-px bg-gray-300" style={{ marginLeft: -0.5 }} />
            )}

            {/* Number */}
            <div className="shrink-0 w-10 h-10 bg-black text-white flex items-center justify-center font-black text-sm z-10">
              {stap.num}
            </div>

            {/* Content */}
            <div className="flex-1 border border-black p-6 bg-white">
              <h3 className="font-black text-sm uppercase tracking-widest mb-1">{stap.title}</h3>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">{stap.desc}</p>

              {stap.templates.length > 0 && (
                <div className="space-y-2">
                  {stap.templates.map(tpl => (
                    <Template key={tpl.id} id={tpl.id} label={tpl.label} content={tpl.content} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
