'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import en from '../messages/en.json';
import xh from '../messages/xh.json';
import { BrandMotif } from './brand-motif';
import type { Viewer } from '../lib/session';

type Language = 'xh' | 'en';
const catalogues = { xh, en } as const;

export function useLanguage(): Language {
  const [language, setLanguage] = useState<Language>('xh');
  useEffect(() => { const stored = window.localStorage.getItem('eoh-language'); if (stored === 'en' || stored === 'xh') setLanguage(stored); }, []);
  return language;
}

export function useLanguagePreference(): readonly [Language, (language: Language) => void] {
  const [language, setLanguage] = useState<Language>('xh');
  useEffect(() => { const stored = window.localStorage.getItem('eoh-language'); if (stored === 'en' || stored === 'xh') setLanguage(stored); }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const chooseLanguage = (nextLanguage: Language) => {
    window.localStorage.setItem('eoh-language', nextLanguage);
    setLanguage(nextLanguage);
  };
  return [language, chooseLanguage] as const;
}

export function Navigation({ viewer }: { viewer: Viewer | null }) {
  const language = useLanguage();
  const t = catalogues[language];
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);

  useEffect(() => { document.documentElement.lang = language; setMenuOpen(false); }, [language, pathname]);

  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!navigator.onLine) { if (active) setApiReachable(false); return; }
      try {
        const response = await fetch('/healthz', { cache: 'no-store', signal: AbortSignal.timeout(3_000) });
        if (active) setApiReachable(response.ok);
      } catch { if (active) setApiReachable(false); }
    };
    const offline = () => { if (active) setApiReachable(false); };
    window.addEventListener('online', check);
    window.addEventListener('offline', offline);
    void check();
    const interval = window.setInterval(() => { void check(); }, 30_000);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('online', check); window.removeEventListener('offline', offline); };
  }, []);

  const link = (href: string, label: string) => <Link href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>;
  const signOut = async () => {
    try {
      const response = await fetch('/v1/auth/logout', { method: 'POST', credentials: 'include', headers: { origin: window.location.origin, 'x-requested-with': 'eoh-web' } });
      if (response.ok) window.location.assign('/');
    } catch { /* Keep the current session visible when the request cannot reach the API. */ }
  };

  return <><a className="skip-link" href="#main-content">{t['nav.skip']}</a>{apiReachable === false && <div className="offline" role="status">{t['offline.banner']}</div>}<header className="topbar"><Link className="brand" href={viewer ? '/families' : '/'}><span className="brand-mark"><BrandMotif /></span>{t['app.name']}</Link>{viewer && <><button className="nav-toggle" type="button" aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? t['nav.close'] : t['nav.menu']}</button><nav id="primary-navigation" className="nav-menu" data-open={menuOpen} aria-label="Primary"><div className="nav-group"><span className="nav-group-label">{t['nav.workflow']}</span><div className="nav-links">{link('/families', t['nav.families'])}{link('/record', t['nav.record'])}{link('/transcription', t['nav.transcription'])}{link('/review', t['nav.review'])}{link('/translation', t['nav.translation'])}{link('/story', t['nav.story'])}</div></div><div className="nav-group"><span className="nav-group-label">{t['nav.account']}</span><div className="nav-links">{link('/profile', t['nav.profile'])}{link('/sessions', t['nav.sessions'])}{link('/intro', t['nav.intro'])}<button className="nav-signout" type="button" onClick={() => void signOut()}>{t['nav.signOut']}</button></div></div></nav></>}</header></>;
}
