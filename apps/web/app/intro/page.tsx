'use client';

import Link from 'next/link';
import { useLanguage } from '../../components/navigation';
import xh from '../../messages/xh.json';
import en from '../../messages/en.json';

export default function IntroPage() { const language = useLanguage(); const t = language === 'xh' ? xh : en; return <section className="card card-wide onboarding-page"><div className="page-intro"><p className="eyebrow">S-04</p><h1>{t['intro.title']}</h1></div><div className="intro-grid"><article className="intro-card"><h2>1</h2><p>{t['intro.card1']}</p></article><article className="intro-card"><h2>2</h2><p>{t['intro.card2']}</p></article><article className="intro-card"><h2>3</h2><p>{t['intro.card3']}</p></article></div><div className="button-row"><Link className="button" href="/families">{t['intro.done']}</Link></div></section>; }
