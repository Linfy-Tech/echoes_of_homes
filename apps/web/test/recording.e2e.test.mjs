import test from 'node:test';
import assert from 'node:assert/strict';

test('recording upload resumes after an interrupted throttled browser request', { skip: process.env.RUN_PLAYWRIGHT !== '1' }, async () => {
  let playwright;
  try { playwright = await import('@playwright/test'); } catch { throw new Error('RUN_PLAYWRIGHT=1 requires @playwright/test and its browser binaries'); }
  const browser = await playwright.chromium.launch();
  try {
    const context = await browser.newContext({ permissions: ['microphone'] });
    const page = await context.newPage();
    let interrupted = false;
    await page.route('**/v1/recordings/*/chunks', async (route, request) => {
      if (interrupted) return route.continue();
      interrupted = true;
      await route.abort('timedout');
    });
    await page.goto(process.env.EOH_WEB_URL ?? 'http://localhost:3000/record');
    await page.getByLabel('Story ID').fill(process.env.EOH_TEST_STORY_ID ?? '00000000-0000-0000-0000-000000000001');
    await page.getByRole('button', { name: 'Start recording' }).click();
    await page.waitForTimeout(5_500);
    await page.getByRole('button', { name: 'Stop and upload' }).click();
    await page.waitForTimeout(1_000);
    await page.reload();
    await page.getByRole('button', { name: 'Resume recording' }).click();
    await page.getByRole('button', { name: 'Stop and upload' }).click();
    await page.getByText('Upload complete. Verification is in progress.').waitFor();
    assert.match(await page.locator('[role=status]').innerText(), /Verification/);
  } finally { await browser.close(); }
});
