'use client';
import { useState } from 'react';

const TEMPLATES = {
  kennismakingNL: {
    label: 'Kennismaking NL',
    subject: 'NAHV – Kennismakingsgesprek',
    body: `Hoi [naam],

Goed om met je in contact te komen! Ik ben Pim, van NAHV – wij verzorgen de administratie, belastingaangiftes en het maandelijkse boekhoudwerk voor zelfstandigen en kleine ondernemingen.

Ik zou graag een kort kennismakingsgesprek inplannen om te kijken of we je goed kunnen helpen. Is er een moment dat jou uitkomt? Ik ben flexibel.

Met vriendelijke groet,
Pim
NAHV – Administratie & Belastingen
www.nahv.nl`,
  },
  kennismakingEN: {
    label: 'Kennismaking EN',
    subject: 'NAHV – Introduction call',
    body: `Hi [name],

Great to connect! I'm Pim, from NAHV – we handle bookkeeping, tax filings and monthly accounting for freelancers and small businesses in the Netherlands.

I'd love to schedule a short introduction call to see how we can help you. Are you available for a quick chat? I'm flexible with timing.

Kind regards,
Pim
NAHV – Accounting & Tax
www.nahv.nl`,
  },
  voorstellNL: {
    label: 'Voorstel NL',
    subject: 'NAHV – Ons voorstel voor je administratie',
    body: `Hoi [naam],

Bedankt voor ons gesprek! Zoals besproken stuur ik je hierbij ons voorstel.

**Wat wij voor je doen:**
- Maandelijkse boekhouding en rapportage
- Btw-aangifte (kwartaal of maand)
- Jaarrekening en inkomstenbelasting
- Persoonlijk aanspreekpunt via e-mail en telefoon

**Prijs:** €[bedrag] per maand (excl. btw)

Dit is een all-in prijs – geen verrassingen achteraf. Je kunt altijd met vragen bij ons terecht.

Wil je akkoord geven? Stuur dan een berichtje terug en ik regel de rest.

Met vriendelijke groet,
Pim
NAHV`,
  },
  voorstellEN: {
    label: 'Voorstel EN',
    subject: 'NAHV – Our proposal for your bookkeeping',
    body: `Hi [name],

Thanks for our conversation! As discussed, please find our proposal below.

**What we do for you:**
- Monthly bookkeeping and reporting
- VAT returns (quarterly or monthly)
- Annual accounts and income tax
- Personal point of contact via email and phone

**Price:** €[amount] per month (excl. VAT)

This is an all-inclusive price – no surprises. You can always reach us with questions.

Ready to proceed? Just send a quick reply and I'll take care of the rest.

Kind regards,
Pim
NAHV`,
  },
  onboardingNL: {
    label: 'Onboarding NL',
    subject: 'Welkom bij NAHV – volgende stappen',
    body: `Hoi [naam],

Welkom bij NAHV! We zijn blij dat je voor ons gekozen hebt.

Om je administratie goed op te starten hebben we het volgende nodig:

1. **KvK-uittreksel** (of je KvK-nummer)
2. **BSN-nummer** (voor belastingzaken)
3. **Bankafschriften** van het lopende jaar (PDF of via Twikey)
4. **Inloggegevens boekhoudpakket** (als je er al een gebruikt)
5. **Openstaande facturen** (debiteuren en crediteuren)

Je kunt alles sturen naar: administratie@nahv.nl

Heb je vragen? Bel of app me gerust.

Met vriendelijke groet,
Pim
NAHV`,
  },
  onboardingEN: {
    label: 'Onboarding EN',
    subject: 'Welcome to NAHV – next steps',
    body: `Hi [name],

Welcome to NAHV! We're happy to have you on board.

To get your bookkeeping set up, we'll need the following:

1. **Chamber of Commerce extract** (or your CoC number)
2. **BSN / tax ID number**
3. **Bank statements** for the current year (PDF or via Twikey)
4. **Accounting software login** (if you're already using one)
5. **Outstanding invoices** (accounts receivable and payable)

Please send everything to: administratie@nahv.nl

Any questions? Feel free to call or message me.

Kind regards,
Pim
NAHV`,
  },
};

const PROCESS_STEPS = [
  {
    step: 1,
    title: 'Lead binnenkomt',
    description: 'Lead wordt toegevoegd via website, referral, Google of netwerk. Datum binnenkoms wordt geregistreerd.',
    color: 'bg-indigo-500',
    textColor: 'text-indigo-700',
    bgLight: 'bg-indigo-50',
    border: 'border-indigo-200',
  },
  {
    step: 2,
    title: 'Opvolging binnen 24u',
    description: 'Stuur kennismakingsmail binnen 1 dag. Opvolgdatum wordt geregistreerd. Doel: snel en persoonlijk reageren.',
    color: 'bg-blue-500',
    textColor: 'text-blue-700',
    bgLight: 'bg-blue-50',
    border: 'border-blue-200',
  },
  {
    step: 3,
    title: 'Kennismakingsgesprek',
    description: 'Telefonisch of video kennismaking plannen. Behoeften en situatie inventariseren. Datum kennismaking vastleggen.',
    color: 'bg-violet-500',
    textColor: 'text-violet-700',
    bgLight: 'bg-violet-50',
    border: 'border-violet-200',
  },
  {
    step: 4,
    title: 'Offerte versturen',
    description: 'Op basis van gesprek maatwerk voorstel sturen. Prijs voorstel vastleggen. Status → Offerte verstuurd.',
    color: 'bg-amber-500',
    textColor: 'text-amber-700',
    bgLight: 'bg-amber-50',
    border: 'border-amber-200',
  },
  {
    step: 5,
    title: 'Klant geworden',
    description: 'Na akkoord: klant_geworden = Ja. Onboarding e-mail sturen. Type klant en alle data compleet maken.',
    color: 'bg-green-500',
    textColor: 'text-green-700',
    bgLight: 'bg-green-50',
    border: 'border-green-200',
  },
  {
    step: 6,
    title: 'Onboarding',
    description: 'Documenten ophalen (KvK, BSN, bankafschriften). Administratie opstarten. Klant welkom in NAHV systeem.',
    color: 'bg-teal-500',
    textColor: 'text-teal-700',
    bgLight: 'bg-teal-50',
    border: 'border-teal-200',
  },
];

type TemplateKey = keyof typeof TEMPLATES;

export default function TemplatesPage() {
  const [selected, setSelected] = useState<TemplateKey>('kennismakingNL');
  const [copied, setCopied] = useState<'subject' | 'body' | null>(null);

  const tpl = TEMPLATES[selected];

  function copy(type: 'subject' | 'body') {
    const text = type === 'subject' ? tpl.subject : tpl.body;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Templates & Proces</h2>
        <p className="text-gray-500 text-sm mt-1">E-mail templates en leads workflow</p>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        {/* Template selector + preview */}
        <div className="col-span-2 card">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">E-mail templates</h3>
          </div>

          {/* Tab buttons */}
          <div className="px-5 pt-4 flex flex-wrap gap-2">
            {(Object.keys(TEMPLATES) as TemplateKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSelected(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selected === key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {TEMPLATES[key].label}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-4">
            {/* Subject */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Onderwerp</label>
                <button
                  onClick={() => copy('subject')}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                >
                  {copied === 'subject' ? '✓ Gekopieerd' : 'Kopieer'}
                </button>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700 font-medium">
                {tpl.subject}
              </div>
            </div>

            {/* Body */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Inhoud</label>
                <button
                  onClick={() => copy('body')}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                >
                  {copied === 'body' ? '✓ Gekopieerd' : 'Kopieer'}
                </button>
              </div>
              <pre className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                {tpl.body}
              </pre>
            </div>
          </div>
        </div>

        {/* Quick reference */}
        <div className="card p-5">
          <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-4">Variabelen</h3>
          <div className="space-y-2 text-sm">
            {[
              { v: '[naam]', d: 'Voornaam van de lead' },
              { v: '[name]', d: "Lead's first name (EN)" },
              { v: '[bedrag]', d: 'Maandbedrag (excl. btw)' },
              { v: '[amount]', d: 'Monthly amount (excl. VAT)' },
            ].map(({ v, d }) => (
              <div key={v} className="flex items-start gap-2">
                <code className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-xs font-mono shrink-0">{v}</code>
                <span className="text-gray-500 text-xs">{d}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">Talen</h3>
            <div className="space-y-1.5 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <span className="w-8 h-5 bg-orange-500 rounded text-white text-xs flex items-center justify-center font-bold">NL</span>
                <span>Nederlands — standaard</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-8 h-5 bg-blue-600 rounded text-white text-xs flex items-center justify-center font-bold">EN</span>
                <span>Engels — buitenlandse klanten</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">Gebruik</h3>
            <ol className="space-y-1.5 text-xs text-gray-600 list-decimal list-inside">
              <li>Selecteer de juiste template</li>
              <li>Kopieer onderwerp en inhoud</li>
              <li>Vervang variabelen</li>
              <li>Verstuur via e-mail</li>
              <li>Noteer datum in leads</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Leads Proces */}
      <div className="card">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Leads Proces</h3>
          <p className="text-xs text-gray-500 mt-0.5">Stap-voor-stap workflow van lead naar klant</p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-3 gap-4 lg:grid-cols-6">
            {PROCESS_STEPS.map((step, i) => (
              <div key={step.step} className="relative">
                {i < PROCESS_STEPS.length - 1 && (
                  <div className="hidden lg:block absolute top-5 left-full w-full h-0.5 bg-gray-200 z-0" style={{ width: 'calc(100% - 2.5rem)', left: '2.5rem' }} />
                )}
                <div className={`relative z-10 rounded-xl border p-4 ${step.bgLight} ${step.border}`}>
                  <div className={`w-8 h-8 rounded-full ${step.color} text-white flex items-center justify-center text-sm font-bold mb-3`}>
                    {step.step}
                  </div>
                  <h4 className={`text-xs font-semibold mb-1.5 ${step.textColor}`}>{step.title}</h4>
                  <p className="text-xs text-gray-600 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Key rules */}
          <div className="mt-6 pt-4 border-t border-gray-100 grid grid-cols-3 gap-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-red-700 mb-1">Opvolgsnelheid</p>
              <p className="text-xs text-gray-600">Altijd binnen <strong>24 uur</strong> opvolgen na binnenkoms. Doel: &lt;1 dag gemiddeld.</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">Stale leads</p>
              <p className="text-xs text-gray-600">Open leads ouder dan <strong>14 dagen</strong> actief opvolgen. Ouder dan 30 dagen: urgentie hoog.</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-green-700 mb-1">Dealcyclus</p>
              <p className="text-xs text-gray-600">Doel: deal sluiten binnen <strong>14 dagen</strong> na eerste contact. Gemiddeld nu ~10 dagen.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
