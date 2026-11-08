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
  return <section className="card" aria-labelledby="families-title"><p className="eyebrow">M2</p><h1 id="families-title">{t['families.title']}</h1><p className="muted">{t['families.description']}</p><form onSubmit={create}><label>{t['families.name']}<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required /></label><div className="button-row"><button className="button" type="submit">{t['families.create']}</button></div></form>{error && <p role="alert">{error}</p>}{families === null ? <p role="status">{t['families.loading']}</p> : families.length === 0 ? <p>{t['families.empty']}</p> : <ul>{families.map((family) => <li key={family.id}>{family.name}</li>)}</ul>}</section>;
}
