'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import en from '../messages/en.json';
import xh from '../messages/xh.json';

type Language = 'xh' | 'en';
const catalogues = { xh, en } as const;

export function LanguageChoice() {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>('xh');
  const t = catalogues[language];
  function continueToSignIn() { window.localStorage.setItem('eoh-language', language); router.push('/sign-in'); }
  return <section className="card" aria-labelledby="language-title"><p className="eyebrow">{t['app.name']}</p><h1 id="language-title">{t['language.title']}</h1><p className="muted">{t['language.description']}</p><div className="choice-grid"><button className="choice" aria-pressed={language === 'xh'} onClick={() => setLanguage('xh')}><strong>{xh['language.isixhosa']}</strong><br /><span className="muted">Molo, wamkelekile</span></button><button className="choice" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}><strong>{en['language.english']}</strong><br /><span className="muted">Hello, welcome</span></button></div><div className="button-row"><button className="button" onClick={continueToSignIn}>{t['common.continue']}</button></div></section>;
}
