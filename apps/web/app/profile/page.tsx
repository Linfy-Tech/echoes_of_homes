'use client';

import { useLanguage } from '../../components/navigation';
import xh from '../../messages/xh.json';
import en from '../../messages/en.json';

export default function ProfilePage() { const language = useLanguage(); const t = language === 'xh' ? xh : en; return <section className="card"><p className="eyebrow">S-10</p><h1>{t['profile.title']}</h1><p><strong>{t['profile.email']}:</strong> preview@example.invalid</p><p><strong>{t['profile.language']}:</strong> {language === 'xh' ? xh['language.isixhosa'] : en['language.english']}</p><p className="muted">{t['profile.save']}</p></section>; }
