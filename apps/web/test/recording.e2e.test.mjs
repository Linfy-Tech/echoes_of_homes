import test from 'node:test';
import assert from 'node:assert/strict';

test('recording upload resumes after an interrupted throttled browser request', { skip: process.env.RUN_PLAYWRIGHT !== '1' }, async () => {
  let playwright;
  try { playwright = await import('@playwright/test'); } catch { throw new Error('RUN_PLAYWRIGHT=1 requires @playwright/test and its browser binaries'); }
  const browser = await playwright.chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
  try {
    const context = await browser.newContext({ permissions: ['microphone'] });
    await context.addCookies([{ name: 'eoh_session', value: 'test-session', url: process.env.EOH_WEB_URL ?? 'http://localhost:3000', httpOnly: true, sameSite: 'Lax' }]);
    const page = await context.newPage();
    await page.addInitScript(() => {
      class FakeMediaRecorder {
        static isTypeSupported() { return true; }
        state = 'inactive';
        mimeType = 'audio/webm';
        ondataavailable = null;
        onstop = null;
        start() { this.state = 'recording'; }
        stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['synthetic-browser-audio'], { type: this.mimeType }) }); this.onstop?.(); }
      }
      globalThis.MediaRecorder = FakeMediaRecorder;
      navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop() {} }] });
    });
    let interrupted = false;
    let recordingId = '00000000-0000-0000-0000-000000000002';
    let uploadId = 'test-upload-id';
    await page.route('**/v1/stories/*/recordings', async (route) => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ recordingId, upload: { uploadId, chunkSizeBytes: 5000000, expiresAt: new Date(Date.now() + 3600000).toISOString() } }) }));
    await page.route('**/v1/recordings/*/chunks', async (route, request) => {
      if (interrupted) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ recordingId, status: 'pending_upload', done: true, bytes: Number(request.headers()['content-length'] ?? 0) }) });
      interrupted = true;
      await route.abort('timedout');
    });
    await page.route('**/v1/recordings/*/complete', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ recordingId, status: 'uploaded', jobId: 'test-job-id' }) }));
    await page.goto(process.env.EOH_WEB_URL ?? 'http://localhost:3000/record');
    await page.getByLabel('Story ID').fill(process.env.EOH_TEST_STORY_ID ?? '00000000-0000-0000-0000-000000000001');
    await page.getByRole('button', { name: 'Start recording' }).click();
    await page.getByRole('button', { name: 'Stop and upload' }).click();
    await page.getByText('Upload paused. Reload to retry the unfinished recording.').waitFor();
    await page.reload();
    await page.getByRole('button', { name: 'Resume recording' }).click();
    await page.getByRole('button', { name: 'Stop and upload' }).click();
    await page.getByText('Upload complete. Verification is in progress.').waitFor();
    assert.match(await page.getByText('Upload complete. Verification is in progress.', { exact: true }).innerText(), /Verification/);
  } finally { await browser.close(); }
});

test('S-25 records, uploads, waits for verified evidence, and creates assisted consent', { skip: process.env.RUN_PLAYWRIGHT !== '1' }, async () => {
  let playwright;
  try { playwright = await import('@playwright/test'); } catch { throw new Error('RUN_PLAYWRIGHT=1 requires @playwright/test and its browser binaries'); }
  const browser = await playwright.chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
  try {
    const context = await browser.newContext({ permissions: ['microphone'] });
    await context.addCookies([{ name: 'eoh_session', value: 'test-session', url: process.env.EOH_WEB_URL ?? 'http://localhost:3000', httpOnly: true, sameSite: 'Lax' }]);
    const page = await context.newPage();
    await page.addInitScript(() => {
      class FakeMediaRecorder {
        static isTypeSupported() { return true; }
        state = 'inactive';
        mimeType = 'audio/webm';
        ondataavailable = null;
        onstop = null;
        start() { this.state = 'recording'; }
        stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['synthetic-consent-audio'], { type: this.mimeType }) }); this.onstop?.(); }
      }
      globalThis.MediaRecorder = FakeMediaRecorder;
      navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop() {} }] });
    });
    const recordingId = '00000000-0000-0000-0000-000000000012';
    const mediaAssetId = '00000000-0000-0000-0000-000000000013';
    const uploadId = 'consent-upload-id';
    let statusChecks = 0;
    await page.route('**/v1/stories/*/recordings', async (route) => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ recordingId, mediaAssetId, upload: { uploadId, chunkSizeBytes: 5000000, expiresAt: new Date(Date.now() + 3600000).toISOString() } }) }));
    await page.route('**/v1/recordings/*/chunks', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ recordingId, status: 'pending_upload', done: true, bytes: 22 }) }));
    await page.route('**/v1/recordings/*/complete', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ recordingId, status: 'uploaded', jobId: 'consent-job-id' }) }));
    await page.route('**/v1/recordings/*', async (route) => {
      const url = route.request().url();
      if (url.endsWith('/chunks')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ recordingId, status: 'pending_upload', done: true, bytes: 22 }) });
      if (url.endsWith('/complete')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ recordingId, status: 'uploaded', jobId: 'consent-job-id' }) });
      statusChecks += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ recordingId, mediaAssetId, status: statusChecks === 1 ? 'uploaded' : 'verified' }) });
    });
    let consentBody;
    await page.route('**/v1/stories/*/consent', async (route) => { consentBody = route.request().postDataJSON(); return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'consent-record-id', evidenceMediaAssetId: consentBody.evidenceMediaAssetId }) }); });
    const storyId = '00000000-0000-0000-0000-000000000014';
    await page.goto(`${process.env.EOH_WEB_URL ?? 'http://localhost:3000'}/consent/${storyId}`);
    await page.getByText('Consent script: We would like to record and safely keep this family story.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Start recording' }).click();
    await page.getByRole('button', { name: 'Stop and upload' }).click();
    await page.getByText('Verbal consent saved with verified evidence.').waitFor({ timeout: 5000 });
    assert.equal(consentBody.method, 'assisted_verbal');
    assert.equal(consentBody.evidenceMediaAssetId, mediaAssetId);
  } finally { await browser.close(); }
});
