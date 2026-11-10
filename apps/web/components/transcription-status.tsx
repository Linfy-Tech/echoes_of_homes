'use client';

import { useLanguage } from './navigation';
import en from '../messages/en.json';
import xh from '../messages/xh.json';
import { useState } from 'react';

type Status = 'queued' | 'processing' | 'complete' | 'failed';
const labels: Record<Status, string> = { queued: 'transcription.status.queued', processing: 'transcription.status.processing', complete: 'transcription.status.complete', failed: 'transcription.status.failed' };

export function TranscriptionStatus({ initialStoryId = '' }: { initialStoryId?: string }) {
  const language = useLanguage(); const t = language === 'xh' ? xh : en; const [storyId, setStoryId] = useState(initialStoryId); const [status, setStatus] = useState<Status>('queued'); const [message, setMessage] = useState('');
  const refresh = async () => {
    if (!storyId) { setMessage(t['transcription.status.missingStory']); return; }
    try { const response = await fetch(`/v1/stories/${storyId}/processing`, { credentials: 'include' }); if (!response.ok) throw new Error('status_unavailable'); const body = await response.json() as { status: Status }; setStatus(body.status); setMessage(''); } catch { setMessage(t['transcription.status.unavailable']); }
  };
  const statusKey = labels[status] as keyof typeof t;
  return <section className="card" aria-labelledby="transcription-status-title"><div className="page-intro"><p className="eyebrow">M4 · Processing</p><h1 id="transcription-status-title">{t['transcription.status.title']}</h1><p className="lead">Your recording is handled carefully before it becomes a transcript for review.</p></div><label>{t['transcription.status.storyId']}<input value={storyId} onChange={(event) => setStoryId(event.target.value)} placeholder="Story UUID" /></label><p className="status" role="status">{t[statusKey]}</p>{message && <p className="alert" role="alert">{message}</p>}<div className="button-row"><button className="button" type="button" onClick={() => void refresh()}>{t['transcription.status.refresh']} <span aria-hidden="true">↻</span></button></div></section>;
}
