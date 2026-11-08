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
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);

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

  return <>{apiReachable === false && <div className="offline" role="status">{t['offline.banner']}</div>}<header className="topbar"><Link className="brand" href="/">{t['app.name']}</Link><nav className="nav-links" aria-label="Primary"><Link href="/families">{t['nav.families']}</Link><Link href="/record">{t['nav.record']}</Link><Link href="/transcription">{t['nav.transcription']}</Link><Link href="/review">{t['nav.review']}</Link><Link href="/translation">{t['nav.translation']}</Link><Link href="/story">{t['nav.story']}</Link><Link href="/intro">{t['nav.intro']}</Link><Link href="/profile">{t['nav.profile']}</Link><Link href="/sessions">{t['nav.sessions']}</Link></nav></header></>;
}
