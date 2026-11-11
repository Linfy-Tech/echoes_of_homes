'use client';

import Link from 'next/link';
import { BrandMotif } from './brand-motif';
import { useLanguagePreference } from './navigation';
import en from '../messages/en.json';
import xh from '../messages/xh.json';

const catalogues = { xh, en } as const;

export function LandingPage() {
  const [language, setLanguage] = useLanguagePreference();
  const t = catalogues[language];

  return <div className="landing-page">
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-copy">
        <p className="eyebrow">{t['landing.eyebrow']}</p>
        <h1 id="landing-title">{t['landing.title']}</h1>
        <p className="landing-lead">{t['landing.description']}</p>
        <div className="button-row landing-actions">
          <Link className="button" href="/sign-in?mode=sign-up">{t['landing.signUp']} <span aria-hidden="true">→</span></Link>
          <Link className="button secondary" href="/sign-in?mode=log-in">{t['landing.logIn']}</Link>
        </div>
        <div className="landing-language" aria-label={t['landing.languageLabel']}>
          <span>{t['landing.languageLabel']}</span>
          <div className="language-toggle" role="group" aria-label={t['landing.languageLabel']}>
            <button type="button" aria-pressed={language === 'xh'} onClick={() => setLanguage('xh')}>{xh['language.isixhosa']}</button>
            <button type="button" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>{en['language.english']}</button>
          </div>
        </div>
      </div>
      <div className="landing-art" aria-hidden="true">
        <div className="landing-art-ring landing-art-ring-one" />
        <div className="landing-art-ring landing-art-ring-two" />
        <BrandMotif className="landing-motif" />
        <span className="landing-art-caption">{t['landing.artCaption']}</span>
      </div>
    </section>
    <section className="landing-principles" aria-labelledby="landing-principles-title">
      <div className="section-intro"><p className="eyebrow">{t['landing.principlesEyebrow']}</p><h2 id="landing-principles-title">{t['landing.principlesTitle']}</h2></div>
      <div className="landing-principle-grid">
        <article><span className="principle-number">01</span><h3>{t['landing.principle1Title']}</h3><p>{t['landing.principle1Description']}</p></article>
        <article><span className="principle-number">02</span><h3>{t['landing.principle2Title']}</h3><p>{t['landing.principle2Description']}</p></article>
        <article><span className="principle-number">03</span><h3>{t['landing.principle3Title']}</h3><p>{t['landing.principle3Description']}</p></article>
      </div>
    </section>
  </div>;
}
