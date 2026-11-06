'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import en from '../messages/en.json';
import xh from '../messages/xh.json';

type Language = 'xh' | 'en';
const catalogues = { xh, en } as const;

export function useLanguage(): Language {
  const [language, setLanguage] = useState<Language>('xh');
  useEffect(() => { const stored = window.localStorage.getItem('eoh-language'); if (stored === 'en' || stored === 'xh') setLanguage(stored); }, []);
  return language;
}

export function Navigation() {
  const language = useLanguage();
  const t = catalogues[language];
  return <><div className="offline" role="status">{t['offline.banner']}</div><header className="topbar"><Link className="brand" href="/">{t['app.name']}</Link><nav className="nav-links" aria-label="Primary"><Link href="/intro">{t['nav.intro']}</Link><Link href="/profile">{t['nav.profile']}</Link><Link href="/sessions">{t['nav.sessions']}</Link></nav></header></>;
}
