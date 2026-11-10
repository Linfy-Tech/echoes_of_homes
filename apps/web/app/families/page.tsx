'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useLanguage } from '../../components/navigation';
import en from '../../messages/en.json';
import xh from '../../messages/xh.json';

type Family = { id: string; name: string };

export default function FamiliesPage() {
  const language = useLanguage();
  const t = language === 'xh' ? xh : en;
  const [families, setFamilies] = useState<Family[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const response = await fetch('/v1/families', { credentials: 'include' });
      if (!response.ok) throw new Error('families_unavailable');
      setFamilies((await response.json() as { data: Family[] }).data);
    } catch { setError(t['families.error']); setFamilies([]); }
  };
  useEffect(() => { void load(); }, [language]);
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    try {
      const response = await fetch('/v1/families', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', origin: window.location.origin, 'x-requested-with': 'eoh-web' }, body: JSON.stringify({ name }) });
      if (!response.ok) throw new Error('family_create_failed');
      const family = await response.json() as Family;
      setFamilies((current) => [...(current ?? []), family]); setName('');
    } catch { setError(t['families.error']); }
  };
  return <section className="card card-wide" aria-labelledby="families-title"><div className="page-intro"><p className="eyebrow">M2 · {t['families.eyebrow']}</p><h1 id="families-title">{t['families.title']}</h1><p className="lead">{t['families.description']}</p></div><div className="grid grid-2"><form className="card card-soft" onSubmit={create}><div className="section-heading"><div><h2>{t['families.create']}</h2><p>{t['families.createHelp']}</p></div></div><label>{t['families.name']}<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required /></label><div className="button-row"><button className="button" type="submit">{t['families.create']} <span aria-hidden="true">→</span></button></div>{error && <p className="alert" role="alert">{error}</p>}</form><section className="card card-soft" aria-labelledby="family-list-title"><div className="section-heading"><div><h2 id="family-list-title">{t['families.listTitle']}</h2><p>{t['families.listHelp']}</p></div></div>{families === null ? <div className="stack" role="status" aria-label={t['families.loading']}><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div> : families.length === 0 ? <div className="empty-state"><h3>{t['families.empty']}</h3><p className="muted">{t['families.emptyHelp']}</p></div> : <ul className="stack">{families.map((family) => <li key={family.id}><strong>{family.name}</strong></li>)}</ul>}</section></div></section>;
}
