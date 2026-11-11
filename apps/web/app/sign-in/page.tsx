'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '../../components/navigation';
import xh from '../../messages/xh.json';
import en from '../../messages/en.json';

export default function SignInPage() {
  const language = useLanguage(); const t = language === 'xh' ? xh : en; const router = useRouter(); const searchParams = useSearchParams();
  const [email, setEmail] = useState(''); const [message, setMessage] = useState(''); const [submitting, setSubmitting] = useState(false);
  const signingUp = searchParams.get('mode') === 'sign-up';
  const next = searchParams.get('next');
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setMessage('');
    try {
      const response = await fetch('/v1/auth/challenges', { method: 'POST', headers: { 'content-type': 'application/json', origin: window.location.origin, 'x-requested-with': 'eoh-web' }, body: JSON.stringify({ email, uiLanguage: language }) });
      if (!response.ok) throw new Error('challenge_failed');
      window.localStorage.setItem('eoh-auth-email', email.trim().toLowerCase());
      const verifyUrl = new URL('/verify', window.location.origin);
      if (next?.startsWith('/') && !next.startsWith('//')) verifyUrl.searchParams.set('next', next);
      router.push(`${verifyUrl.pathname}${verifyUrl.search}`);
    } catch { setMessage(t['signin.error']); } finally { setSubmitting(false); }
  };
  return <section className="card hero-card auth-card"><div className="page-intro"><p className="eyebrow">S-02 · {signingUp ? t['landing.signUp'] : t['landing.logIn']}</p><h1>{signingUp ? t['signin.signUpTitle'] : t['signin.title']}</h1><p className="lead">{signingUp ? t['signin.signUpDescription'] : t['signin.description']}</p></div><form onSubmit={(event) => void submit(event)}><label htmlFor="email">{t['signin.emailLabel']}<input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><div className="button-row"><button className="button" type="submit" disabled={submitting}>{submitting ? t['signin.sending'] : t['signin.sendCode']} <span aria-hidden="true">→</span></button></div></form>{message && <p className="alert" role="alert">{message}</p>}</section>;
}
