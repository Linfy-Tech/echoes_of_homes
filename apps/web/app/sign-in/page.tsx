'use client';

import Link from 'next/link';
import { useLanguage } from '../../components/navigation';
import xh from '../../messages/xh.json';
import en from '../../messages/en.json';

export default function SignInPage() { const language = useLanguage(); const t = language === 'xh' ? xh : en; return <section className="card"><p className="eyebrow">S-02</p><h1>{t['signin.title']}</h1><p className="muted">{t['signin.description']}</p><label htmlFor="email">{t['signin.emailLabel']}<input id="email" type="email" autoComplete="email" placeholder="name@example.invalid" /></label><div className="button-row"><Link className="button" href="/verify">{t['signin.sendCode']}</Link><span className="muted">{t['common.mock']}</span></div></section>; }
