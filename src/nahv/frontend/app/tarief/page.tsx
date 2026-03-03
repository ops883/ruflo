'use client';
import { useState, useEffect } from 'react';

const BASIS = [
  { value: 895, label: 'ZZP / Eenmanszaak', sublabel: '€895 / jaar' },
  { value: 1500, label: 'BV / DGA', sublabel: '€1.500 / jaar' },
  { value: 4500, label: 'US Expat / LLC', sublabel: '€4.500 / jaar' },
];

function eur(v: number) { return `€${v.toLocaleString('nl-NL')}`; }

export default function TariefPage() {
  const [naam, setNaam] = useState('');
  const [basis, setBasis] = useState(895);
  const [partner, setPartner] = useState(false);
  const [box3, setBox3] = useState(false);
  const [llcs, setLlcs] = useState(0);
  const [lang, setLang] = useState<'NL' | 'EN'>('NL');
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);

  const totaal = basis + (partner ? 250 : 0) + (box3 ? 1500 : 0) + (llcs * 500);

  useEffect(() => { setOutput(''); }, [naam, basis, partner, box3, llcs, lang]);

  function generate() {
    const n = naam || '[Klant]';
    const fee = eur(totaal);
    if (lang === 'NL') {
      setOutput(`Beste ${n},

Dank voor het prettige gesprek zojuist. Zoals beloofd stuur ik je hierbij ons voorstel.

Op basis van ons gesprek hebben we de volgende diensten voor je uitgewerkt:
- Controle en verwerking van de administratie
- Btw-aangiftes (kwartaal)
- Opstellen van de jaarstukken
- Inkomstenbelasting aangifte${partner ? ' (voor jou en fiscale partner)' : ''}${box3 ? '\n- Box 3 beleggingsanalyse' : ''}${llcs > 0 ? `\n- ${llcs} extra werkmaatschappij/LLC` : ''}

De verwachte jaarlijkse investering bedraagt ${fee} excl. btw.

Gaat dit akkoord? Dan zet ik de volgende stappen in gang.

Met vriendelijke groet,
Pim Holthof
NAHV Belastingadviseurs`);
    } else {
      setOutput(`Hi ${n},

Thank you for the pleasant call earlier today. As promised, please find our proposal below.

Based on our conversation, we have outlined the following services for you:
- Review and processing of your administration
- VAT returns (quarterly)
- Preparation of annual financial statements
- Annual income tax return${partner ? ' (for you and fiscal partner)' : ''}${box3 ? '\n- Box 3 investment analysis' : ''}${llcs > 0 ? `\n- ${llcs} additional work company/LLC` : ''}

The expected annual investment is ${fee} excl. VAT.

Do you agree? Then I will set the next steps in motion.

Best regards,
Pim Holthof
NAHV Tax Advisors`);
    }
  }

  function copy() {
    navigator.clipboard.writeText(output).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <div className="p-10 max-w-6xl">
      <div className="mb-10">
        <h2 className="text-3xl font-black tracking-tighter">Tarief & Voorstel</h2>
        <p className="text-sm text-gray-500 mt-1 font-medium">Bereken het tarief en genereer een voorstel template.</p>
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* Calculator */}
        <div className="col-span-5 border-2 border-black p-8 flex flex-col">
          <p className="section-header">Variabelen</p>

          <div className="space-y-6 flex-1">
            {/* Naam */}
            <div>
              <label className="label">Klantnaam</label>
              <input
                type="text"
                className="input"
                placeholder="Bijv. Tim Jansen"
                value={naam}
                onChange={e => setNaam(e.target.value)}
              />
            </div>

            {/* Basistype */}
            <div>
              <label className="label">Type Structuur</label>
              <div className="space-y-2">
                {BASIS.map(b => (
                  <label key={b.value} className={`flex items-center justify-between p-3 border cursor-pointer ${basis === b.value ? 'border-black bg-black text-white' : 'border-black hover:bg-gray-50'}`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="basis"
                        checked={basis === b.value}
                        onChange={() => setBasis(b.value)}
                        className="sr-only"
                      />
                      <span className="text-xs font-bold uppercase tracking-widest">{b.label}</span>
                    </div>
                    <span className={`text-xs font-black ${basis === b.value ? 'text-gray-300' : 'text-gray-500'}`}>{b.sublabel}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Extra's */}
            <div>
              <label className="label">Aanvullende Diensten</label>
              <div className="space-y-2">
                <label className={`flex items-center justify-between p-3 border cursor-pointer ${partner ? 'border-black bg-black text-white' : 'border-black hover:bg-gray-50'}`}>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={partner} onChange={e => setPartner(e.target.checked)} className="sr-only" />
                    <span className="text-xs font-bold uppercase tracking-widest">Fiscale Partner IB</span>
                  </div>
                  <span className={`text-xs font-black ${partner ? 'text-gray-300' : 'text-gray-500'}`}>+ €250</span>
                </label>
                <label className={`flex items-center justify-between p-3 border cursor-pointer ${box3 ? 'border-black bg-black text-white' : 'border-black hover:bg-gray-50'}`}>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={box3} onChange={e => setBox3(e.target.checked)} className="sr-only" />
                    <span className="text-xs font-bold uppercase tracking-widest">Box 3 Beleggingsanalyse</span>
                  </div>
                  <span className={`text-xs font-black ${box3 ? 'text-gray-300' : 'text-gray-500'}`}>+ €1.500</span>
                </label>
                <div className="flex items-center justify-between p-3 border border-black">
                  <span className="text-xs font-bold uppercase tracking-widest">Extra Werkmaatschappijen / LLC&apos;s</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={llcs}
                      onChange={e => setLlcs(Math.max(0, parseInt(e.target.value) || 0))}
                      className="input w-16 text-center py-1 text-sm font-bold"
                    />
                    <span className="text-xs font-bold text-gray-500">× €500</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Total + CTA */}
          <div className="mt-8 pt-6 flex items-center justify-between" style={{ borderTop: '2px solid #000' }}>
            <div>
              <p className="stat-label">Totale Fee / Jaar</p>
              <p className="text-4xl font-black tracking-tighter mt-1">{eur(totaal)}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setLang(l => l === 'NL' ? 'EN' : 'NL')} className="btn-secondary text-xs px-4 py-3">{lang}</button>
              <button onClick={generate} className="btn-primary">Genereer</button>
            </div>
          </div>
        </div>

        {/* Output */}
        <div className="col-span-7 border-2 border-black flex flex-col" style={{ minHeight: 500 }}>
          <div className="flex justify-between items-center px-5 py-4 bg-gray-50" style={{ borderBottom: '2px solid #000' }}>
            <span className="text-xs font-black uppercase tracking-widest">Voorstel Resultaat ({lang})</span>
            {output && (
              <button onClick={copy} className="btn-secondary text-xs px-3 py-1.5">
                {copied ? '✓ Gekopieerd' : 'Kopieer'}
              </button>
            )}
          </div>
          <textarea
            readOnly
            className="flex-1 p-6 text-sm leading-relaxed text-gray-700 bg-transparent border-none resize-none outline-none font-mono"
            placeholder="Klik op 'Genereer' om het voorstel te maken..."
            value={output}
          />
        </div>
      </div>

      {/* Referentieprijzen */}
      <div className="mt-10 border-2 border-black">
        <div className="px-6 py-4 bg-black text-white">
          <h3 className="text-xs font-black uppercase tracking-widest">Tariefoverzicht (Referentie)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid #000' }}>
                {['Type', 'Basistarief', 'Met Partner', 'Met Box 3', 'US/LLC Extra'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-black uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { type: 'ZZP / Eenmanszaak', basis: 895, partner: 1145, box3: 2395, llc: 500 },
                { type: 'BV / DGA', basis: 1500, partner: 1750, box3: 3000, llc: 500 },
                { type: 'US Expat / LLC', basis: 4500, partner: 4750, box3: 6000, llc: 500 },
              ].map((r, i) => (
                <tr key={r.type} className="hover:bg-gray-50" style={{ borderBottom: i < 2 ? '1px solid #000' : undefined }}>
                  <td className="px-5 py-3 font-black text-xs uppercase tracking-wide">{r.type}</td>
                  <td className="px-5 py-3 font-black">{eur(r.basis)}</td>
                  <td className="px-5 py-3 font-bold text-gray-600">{eur(r.partner)}</td>
                  <td className="px-5 py-3 font-bold text-gray-600">{eur(r.box3)}</td>
                  <td className="px-5 py-3 font-bold text-gray-600">+{eur(r.llc)} p/st</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
