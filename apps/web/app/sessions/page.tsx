'use client';

import { useLanguage } from '../../components/navigation';
import xh from '../../messages/xh.json';
import en from '../../messages/en.json';

export default function SessionsPage() { const language = useLanguage(); const t = language === 'xh' ? xh : en; return <section className="card"><p className="eyebrow">S-11</p><h1>{t['sessions.title']}</h1><p className="muted">{t['sessions.description']}</p><div className="session-list"><div className="session-item"><span><strong>{t['sessions.current']}</strong><br /><span className="muted">{t['sessions.previewPhone']}</span></span><span className="status">Active</span></div><div className="session-item"><span><strong>{t['sessions.previewLaptop']}</strong><br /><span className="muted">Preview data</span></span><button className="button secondary">{t['sessions.revoke']}</button></div></div></section>; }
