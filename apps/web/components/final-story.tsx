'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from './navigation';
import en from '../messages/en.json';
import xh from '../messages/xh.json';

type Version = { id: string; isiXhosaText: string; englishText: string | null; audioAssetId: string; provenance: Array<{ action: string; actorUserId: string; occurredAt: string }> };
type Reader = { version: Version; audience: 'private' | 'family' | 'public'; audioUrl: string };

export function FinalStory({ storyId = '', publicSharingEnabled = false }: { storyId?: string; publicSharingEnabled?: boolean }) {
  const language = useLanguage(); const t = language === 'xh' ? xh : en;
  const [preview, setPreview] = useState<Version | null>(null); const [reader, setReader] = useState<Reader | null>(null); const [message, setMessage] = useState('');
  useEffect(() => { if (!storyId) return; fetch(`/v1/stories/${encodeURIComponent(storyId)}/versions/current`, { credentials: 'include' }).then((response) => response.ok ? response.json() as Promise<Version> : Promise.reject(new Error('preview_unavailable'))).then(setPreview).catch(() => setMessage(t['story.unavailable'])); }, [storyId, t]);
  const openReader = async () => { if (!storyId) return; const response = await fetch(`/v1/stories/${encodeURIComponent(storyId)}/reader`, { credentials: 'include' }); if (response.ok) setReader(await response.json() as Reader); else setMessage(t['story.accessDenied']); };
  const changeAudience = async (audience: 'private' | 'family') => { if (!storyId) return; const response = await fetch(`/v1/stories/${encodeURIComponent(storyId)}/audience`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json', 'if-match': '*', origin: window.location.origin, 'x-requested-with': 'eoh-web' }, body: JSON.stringify({ audience }) }); setMessage(response.ok ? t['story.audienceChanged'] : t['story.audienceBlocked']); if (response.ok) await openReader(); };
  const version = reader?.version ?? preview;
  return <section className="card" aria-labelledby="final-story-title"><p className="eyebrow">S-70 · S-71 · S-80 · S-90 · S-91</p><h1 id="final-story-title">{t['story.title']}</h1>{message && <p role="status">{message}</p>}<div aria-label={t['story.preview']}><h2>{t['story.preview']}</h2><p>{version?.isiXhosaText ?? t['story.noPreview']}</p>{version?.englishText && <p>{version.englishText}</p>}</div>{version && <><h2>{t['story.reader']}</h2><audio controls preload="none" src={reader?.audioUrl} aria-label={t['story.audio']} /><details><summary>{t['story.provenance']}</summary><ul>{version.provenance.map((item) => <li key={`${item.action}-${item.occurredAt}`}>{item.action} — {item.actorUserId} — {item.occurredAt}</li>)}</ul></details></>}<div className="button-row" aria-label={t['story.sharing']}><button className="button secondary" type="button" onClick={() => void changeAudience('private')}>{t['story.keepPrivate']}</button><button className="button" type="button" onClick={() => void changeAudience('family')}>{t['story.shareFamily']}</button>{publicSharingEnabled && <button className="button secondary" type="button" disabled>{t['story.sharePublic']}</button>}<button className="button secondary" type="button" onClick={() => void openReader()}>{t['story.openReader']}</button></div></section>;
}
