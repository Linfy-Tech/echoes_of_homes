'use client';

import Link from 'next/link';
import { useLanguage } from '../../components/navigation';
import xh from '../../messages/xh.json';
import en from '../../messages/en.json';

export default function VerifyPage() { const language = useLanguage(); const t = language === 'xh' ? xh : en; return <section className="card"><p className="eyebrow">S-03</p><h1>{t['verify.title']}</h1><p className="muted">{t['verify.description']}</p><label htmlFor="code">{t['verify.codeLabel']}<input id="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} /></label><div className="button-row"><Link className="button" href="/intro">{t['verify.verify']}</Link><Link className="button secondary" href="/sign-in">{t['common.back']}</Link></div></section>; }
