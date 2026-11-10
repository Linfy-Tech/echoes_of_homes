'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../components/navigation';
import xh from '../../messages/xh.json';
import en from '../../messages/en.json';

export default function VerifyPage() {
  const language = useLanguage(); const t = language === 'xh' ? xh : en; const router = useRouter();
  const [email, setEmail] = useState(''); const [otp, setOtp] = useState(''); const [message, setMessage] = useState(''); const [submitting, setSubmitting] = useState(false);
  useEffect(() => { setEmail(window.localStorage.getItem('eoh-auth-email') ?? ''); }, []);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setMessage('');
    try {
      const response = await fetch('/v1/auth/challenges/verify', { method: 'POST', headers: { 'content-type': 'application/json', origin: window.location.origin, 'x-requested-with': 'eoh-web' }, body: JSON.stringify({ email, otp }) });
      if (!response.ok) throw new Error('verify_failed');
      router.push('/intro');
    } catch { setMessage(t['verify.error']); } finally { setSubmitting(false); }
  };
  return <section className="card hero-card"><div className="page-intro"><p className="eyebrow">S-03 · One small step</p><h1>{t['verify.title']}</h1><p className="lead">{t['verify.description']}</p></div><form onSubmit={(event) => void submit(event)}><label htmlFor="code">{t['verify.codeLabel']}<input id="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value)} required /></label><div className="button-row"><button className="button" type="submit" disabled={submitting || !email}>{submitting ? t['verify.verifying'] : t['verify.verify']} <span aria-hidden="true">→</span></button><Link className="button secondary" href="/sign-in">{t['common.back']}</Link></div></form>{message && <p className="alert" role="alert">{message}</p>}</section>;
}
