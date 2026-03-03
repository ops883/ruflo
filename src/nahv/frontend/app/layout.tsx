import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '../components/Sidebar';

export const metadata: Metadata = {
  title: 'NAHV · Verkoopplatform',
  description: 'Sales en lead management platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className="flex h-screen overflow-hidden bg-white">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-white">
          {children}
        </main>
      </body>
    </html>
  );
}
