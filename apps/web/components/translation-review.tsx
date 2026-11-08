'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from './navigation';
import en from '../messages/en.json';
import xh from '../messages/xh.json';

type Translation = { id: string; status: string; segments: Array<{ id: string; sourceSegmentId: string; closeText: string; naturalText: string; version: number }>; report: { issues: Array<{ id: string; checkId: string; severity: string; status: string }> } | null };

export function TranslationReview({ translationId }: { translationId?: string }) {
  const language = useLanguage(); const t = language === 'xh' ? xh : en;
  const [translation, setTranslation] = useState<Translation | null>(null); const [message, setMessage] = useState('');
  useEffect(() => { if (!translationId) return; fetch(`/v1/translations/${encodeURIComponent(translationId)}`, { credentials: 'include' }).then((response) => response.ok ? response.json() as Promise<Translation> : Promise.reject(new Error('translation_unavailable'))).then(setTranslation).catch(() => setMessage(t['translation.unavailable'])); }, [translationId, t]);
  const blocking = translation?.report?.issues.filter((issue) => issue.severity === 'blocking' && issue.status === 'open') ?? [];
  const approve = async () => { if (!translation) return; const response = await fetch(`/v1/translations/${encodeURIComponent(translation.id)}/approve`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', origin: window.location.origin, 'x-requested-with': 'eoh-web' }, body: '{}' }); setMessage(response.ok ? t['translation.approved'] : t['translation.resolveBlocking']); };
  return <section className="card" aria-labelledby="translation-review-title"><p className="eyebrow">S-60 · S-61</p><h1 id="translation-review-title">{t['translation.title']}</h1>{message && <p role="status">{message}</p>}<p>{t['translation.blocking']}: {blocking.length}</p><div className="review-list" aria-label="Translation segments">{translation?.segments.map((segment) => <article className="intro-card" key={segment.id}><p><strong>{t['translation.sourceSegment']} {segment.sourceSegmentId}</strong></p><p aria-label="Close translation">{segment.closeText}</p><p aria-label="Natural translation">{segment.naturalText}</p></article>)}</div><button className="button" type="button" disabled={!translation || blocking.length > 0} onClick={() => void approve()}>{t['translation.approve']}</button></section>;
}
