import type { Metadata } from 'next';
import './globals.css';
import { Navigation } from '../components/navigation';

export const metadata: Metadata = {
  title: 'Echoes of Home',
  description: 'A private-by-default oral-history home.',
  applicationName: 'Echoes of Home',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="xh"><body><Navigation /><main className="page-shell">{children}</main></body></html>;
}
