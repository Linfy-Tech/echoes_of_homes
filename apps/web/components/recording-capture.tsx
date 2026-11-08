'use client';

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { useEffect, useRef, useState } from 'react';
import { chooseRecorderMimeType } from '../lib/recording';

type SavedChunk = { key: string; localId: string; index: number; blob: Blob };
type SavedRecording = { localId: string; storyId: string; mimeType: string; chunks: number; uploadedRecordingId?: string; uploadId?: string; mediaAssetId?: string; totalBytes?: number; confirmedBytes: number };
const databaseName = 'echoes-of-home-recordings';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains('recordings')) db.createObjectStore('recordings', { keyPath: 'localId' }); if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks', { keyPath: 'key' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexeddb_open_failed'));
  });
}

async function idbPut(storeName: string, value: SavedRecording | SavedChunk): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => { const request = db.transaction(storeName, 'readwrite').objectStore(storeName).put(value); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
  db.close();
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDatabase();
  const result = await new Promise<T[]>((resolve, reject) => { const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll(); request.onsuccess = () => resolve(request.result as T[]); request.onerror = () => reject(request.error); });
  db.close();
  return result;
}

async function idbDeleteRecording(localId: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => { const transaction = db.transaction(['recordings', 'chunks'], 'readwrite'); transaction.objectStore('recordings').delete(localId); for (let index = 0; index < 10_000; index += 1) transaction.objectStore('chunks').delete(`${localId}:${index}`); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
  db.close();
}

export function RecordingCapture({ storyId: initialStoryId = '', purpose = 'story', prompt, onUploadComplete }: { storyId?: string; purpose?: 'story' | 'consent_evidence'; prompt?: string; onUploadComplete?: (result: { recordingId: string; mediaAssetId: string }) => void }) {
  const [storyId, setStoryId] = useState(initialStoryId);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [recovery, setRecovery] = useState<SavedRecording | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => { void idbGetAll<SavedRecording>('recordings').then((records) => { const unfinished = records.find((record) => record.confirmedBytes < (record.totalBytes ?? Number.MAX_SAFE_INTEGER)); if (unfinished) { setRecovery(unfinished); setStoryId(unfinished.storyId); setMessage('An unfinished recording was found on this device.'); } }).catch(() => setMessage('Local recording recovery is unavailable on this browser.')); }, []);

  const start = async () => {
    if (!storyId) { setMessage('Enter the story ID before recording.'); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setMessage('Audio recording is not supported by this browser.'); return; }
    const mimeType = chooseRecorderMimeType(MediaRecorder);
    if (!mimeType) { setMessage('This browser cannot record a supported audio format. Try a newer Safari or Chrome.'); return; }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const localId = recovery?.localId ?? crypto.randomUUID();
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = (event) => { if (event.data.size) { const index = chunksRef.current.length; chunksRef.current.push(event.data); void idbPut('chunks', { key: `${localId}:${index}`, localId, index, blob: event.data }); void idbPut('recordings', { localId, storyId, mimeType, chunks: index + 1, confirmedBytes: recovery?.confirmedBytes ?? 0 }); } };
    recorder.onerror = () => { stream.getTracks().forEach((track) => track.stop()); setStatus('error'); setMessage('Recording failed. Your saved chunks remain available for recovery.'); };
    recorder.onstop = () => stream.getTracks().forEach((track) => track.stop());
    recorderRef.current = recorder;
    recorder.start(5000);
    setStatus('recording'); setMessage('Recording… keep this page open until upload starts.');
  };

  const stopAndUpload = async () => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
    setStatus('preparing');
    await new Promise((resolve) => setTimeout(resolve, 50));
    const saved = recovery ? (await idbGetAll<SavedChunk>('chunks')).filter((chunk) => chunk.localId === recovery.localId).sort((a, b) => a.index - b.index).map((chunk) => chunk.blob) : chunksRef.current;
    if (!saved.length) { setStatus('error'); setMessage('No audio chunks were captured.'); return; }
    const audio = new Blob(saved, { type: recorder?.mimeType ?? recovery?.mimeType ?? 'audio/webm' });
    const bytes = new Uint8Array(await audio.arrayBuffer());
    let recordingId = recovery?.uploadedRecordingId; let uploadId = recovery?.uploadId;
    let mediaAssetId: string | undefined = recovery?.mediaAssetId;
    if (!recordingId || !uploadId) { const response = await fetch(`/v1/stories/${storyId}/recordings`, { method: 'POST', headers: { 'content-type': 'application/json', origin: window.location.origin, 'x-requested-with': 'eoh-web' }, body: JSON.stringify({ source: 'browser_recording', purpose, sha256: bytesToHex(sha256(bytes)), sizeBytes: bytes.byteLength, mimeType: audio.type }) }); if (!response.ok) { setStatus('error'); setMessage('The server did not accept this recording. Check consent and try again.'); return; } const created = await response.json() as { recordingId: string; mediaAssetId: string; upload: { uploadId: string } }; recordingId = created.recordingId; uploadId = created.upload.uploadId; mediaAssetId = created.mediaAssetId; await idbPut('recordings', { localId: recovery?.localId ?? crypto.randomUUID(), storyId, mimeType: audio.type, chunks: saved.length, totalBytes: bytes.byteLength, confirmedBytes: 0, uploadedRecordingId: recordingId, uploadId, mediaAssetId }); }
    let offset = recovery?.confirmedBytes ?? 0; const chunkSize = 5_000_000;
    for (; offset < bytes.byteLength;) { const end = Math.min(offset + chunkSize, bytes.byteLength); const chunk = bytes.subarray(offset, end); let uploaded: Response; try { uploaded = await fetch(`/v1/recordings/${recordingId}/chunks`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', origin: window.location.origin, 'x-requested-with': 'eoh-web', 'x-upload-id': uploadId, 'content-range': `bytes ${offset}-${end - 1}/${bytes.byteLength}` }, body: chunk }); } catch { setStatus('error'); setMessage('Upload paused. Reload to retry the unfinished recording.'); return; } if (!uploaded.ok) { setStatus('error'); setMessage('Upload paused. Reload to retry the unfinished recording.'); return; } offset = end; if (recovery) await idbPut('recordings', { ...recovery, totalBytes: bytes.byteLength, confirmedBytes: offset, uploadedRecordingId: recordingId, uploadId }); }
    const completed = await fetch(`/v1/recordings/${recordingId}/complete`, { method: 'POST', headers: { origin: window.location.origin, 'x-requested-with': 'eoh-web' } });
    if (!completed.ok) { setStatus('error'); setMessage('Upload is incomplete; your local recording remains available.'); return; }
    setStatus('uploaded'); setMessage('Upload complete. Verification is in progress.'); if (onUploadComplete && recordingId && mediaAssetId) onUploadComplete({ recordingId, mediaAssetId }); if (recovery) await idbDeleteRecording(recovery.localId); setRecovery(null);
  };

  return <section aria-labelledby="recording-title"><h1 id="recording-title">{purpose === 'consent_evidence' ? 'Record verbal consent' : 'Record a story'}</h1>{prompt && <p>{prompt}</p>}<label>Story ID<input value={storyId} onChange={(event) => setStoryId(event.target.value)} placeholder="Story UUID" /></label><p role="status">{message}</p>{recovery && <button type="button" onClick={() => setRecovery(null)}>Start a new recording</button>}{status === 'recording' ? <button type="button" onClick={() => void stopAndUpload()}>Stop and upload</button> : <button type="button" onClick={() => void start()} disabled={status === 'preparing'}>{recovery ? 'Resume recording' : 'Start recording'}</button>}</section>;
}
