'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '../../components/navigation';
import xh from '../../messages/xh.json';
import en from '../../messages/en.json';

export default function ProfilePage() { const language = useLanguage(); const t = language === 'xh' ? xh : en; const [email, setEmail] = useState<string | null>(null); const [message, setMessage] = useState(''); useEffect(() => { fetch('/v1/me', { credentials: 'include' }).then((response) => response.ok ? response.json() as Promise<{ email: string }> : Promise.reject(new Error('profile_unavailable'))).then((user) => setEmail(user.email)).catch(() => setMessage(t['profile.unavailable'])); }, [t]); return <section className="card account-page"><div className="page-intro"><p className="eyebrow">S-10 · Your details</p><h1>{t['profile.title']}</h1></div><div className="account-summary">{email ? <p><strong>{t['profile.email']}:</strong> {email}</p> : <p className={message ? 'alert' : 'status'} role={message ? 'alert' : 'status'}>{message || t['profile.loading']}</p>}<p><strong>{t['profile.language']}:</strong> {language === 'xh' ? xh['language.isixhosa'] : en['language.english']}</p><p className="muted">{t['profile.save']}</p></div></section>; }
