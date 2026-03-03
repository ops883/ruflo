'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/leads', label: 'Leads' },
  { href: '/pipeline', label: 'Pijplijn' },
  { href: '/kpi', label: 'KPI & Doelen' },
  { href: '/bronanalyse', label: 'Bronanalyse' },
  { href: '/templates', label: 'Werkwijze & Templates' },
  { href: '/tarief', label: 'Tarief & Voorstel' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-black text-white flex flex-col shrink-0" style={{ borderRight: '2px solid #000' }}>
      <div className="px-6 py-6" style={{ borderBottom: '1px solid #222' }}>
        <h1 className="text-xl font-black tracking-tighter text-white">NAHV</h1>
        <p className="text-xs font-bold tracking-widest uppercase mt-1 text-gray-500">Verkoopplatform</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{ borderLeft: active ? '4px solid #fff' : '4px solid transparent' }}
              className={`flex items-center px-4 py-3 text-xs font-bold uppercase tracking-widest ${
                active
                  ? 'bg-white text-black'
                  : 'text-gray-400 hover:bg-gray-900 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-6 py-5" style={{ borderTop: '1px solid #222' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white text-black flex items-center justify-center font-black text-xs">PH</div>
          <div>
            <p className="text-xs font-bold text-white">Pim Holthof</p>
            <p className="text-xs text-gray-500">Verkoopleider</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
