import { LandingPage } from '../components/landing-page';
import { redirect } from 'next/navigation';
import { currentViewer } from '../lib/auth';

export default async function HomePage() {
  if (await currentViewer()) redirect('/families');
  return <LandingPage />;
}
