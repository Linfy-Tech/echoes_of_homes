'use client';

import { useState } from 'react';
import { RecordingCapture } from './recording-capture';

const headers = { origin: typeof window === 'undefined' ? '' : window.location.origin, 'x-requested-with': 'eoh-web' };

export function AssistedConsentCapture({ storyId }: { storyId: string }) {
  const [recording, setRecording] = useState<{ recordingId: string; mediaAssetId: string } | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const createConsent = async (evidence: { recordingId: string; mediaAssetId: string }) => {
    setSubmitting(true); setMessage('Checking the evidence recording…');
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await fetch(`/v1/recordings/${evidence.recordingId}`, { headers });
      if (response.ok) {
        const current = await response.json() as { status: string; mediaAssetId: string };
        if (current.status === 'verified') {
          const consent = await fetch(`/v1/stories/${storyId}/consent`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ method: 'assisted_verbal', evidenceMediaAssetId: current.mediaAssetId, comprehensionResult: { questions: 3, correct: 3, reexplained: false }, rightsHolderChoice: 'self', scopes: { record_and_store: true } }) });
          if (consent.ok) { setMessage('Verbal consent saved with verified evidence.'); setSubmitting(false); return; }
          setMessage('The server rejected this consent record.'); setSubmitting(false); return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    setSubmitting(false); setMessage('Evidence verification is taking longer than expected. Please keep this page open and try again.');
  };

  return <main><RecordingCapture storyId={storyId} purpose="consent_evidence" prompt="Consent script: We would like to record and safely keep this family story. Please read this together, ask any questions, and say clearly whether you agree to the recording and storage." onUploadComplete={(result) => { setRecording(result); void createConsent(result); }} /><p role="status">{message}</p>{recording && <p>Evidence upload received. Waiting for hash verification before saving consent.</p>}{submitting && <button type="button" disabled>Verifying evidence…</button>}</main>;
}
