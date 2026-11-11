import type { Metadata } from 'next';
import './globals.css';
import { Navigation } from '../components/navigation';
import { currentViewer } from '../lib/auth';

export const metadata: Metadata = {
  title: 'Echoes of Home',
  description: 'A private-by-default oral-history home.',
  applicationName: 'Echoes of Home',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const viewer = await currentViewer();
  return <html lang="xh"><body><Navigation viewer={viewer} /><main id="main-content" className="page-shell">{children}</main></body></html>;
}
