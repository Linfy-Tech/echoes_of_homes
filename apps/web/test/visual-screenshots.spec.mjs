import { test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const outputDir = process.env.SCREENSHOT_DIR ?? '/tmp/echoes-screenshots';
const variant = process.env.SCREENSHOT_VARIANT ?? 'after';
const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3000';
const viewports = { desktop: { width: 1440, height: 1100 }, mobile: { width: 390, height: 844 } };
const locales = ['en', 'xh'];

const groups = [
  { name: '01-global-shell-navigation', routes: ['/families'] },
  { name: '02-first-impression', routes: ['/', '/sign-in', '/verify'] },
  { name: '03-core-demo-path', routes: ['/families', '/consent/demo-story', '/record'] },
  { name: '04-review-workflow', routes: ['/transcription', '/review', '/translation'] },
  { name: '05-story-reader-sharing', routes: ['/story'] },
  { name: '06-profile-sessions', routes: ['/profile', '/sessions'] },
];

async function mockDemoEndpoints(page) {
  await page.route('**/healthz', (route) => route.fulfill({ status: 200, body: 'ok' }));
  await page.route('**/v1/families', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'family-1', name: 'KwaMthembu family' }] }) }));
  await page.route('**/v1/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'user-1', email: 'demo@example.com' }) }));
  await page.route('**/v1/me/sessions', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' }] }) }));
}

async function captureLocale(browser, locale) {
  const context = await browser.newContext({ viewport: viewports.desktop });
  await context.addInitScript((selectedLocale) => window.localStorage.setItem('eoh-language', selectedLocale), locale);
  const page = await context.newPage();
  await mockDemoEndpoints(page);

  for (const group of groups) {
    for (const route of group.routes) {
      await page.setViewportSize(viewports.desktop);
      await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'networkidle' });
      if (route === '/') {
        const languageButton = locale === 'xh' ? /isiXhosa/i : /English/i;
        await page.getByRole('button', { name: languageButton }).click();
      }
      const name = `${route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')}.png`;
      const desktopPath = path.join(outputDir, variant, locale, 'desktop', group.name, name);
      const mobilePath = path.join(outputDir, variant, locale, 'mobile', group.name, name);
      await fs.mkdir(path.dirname(desktopPath), { recursive: true });
      await page.screenshot({ path: desktopPath, fullPage: true });
      await page.setViewportSize(viewports.mobile);
      await fs.mkdir(path.dirname(mobilePath), { recursive: true });
      await page.screenshot({ path: mobilePath, fullPage: true });
    }
  }
  await context.close();
}

test('capture demo screen set', async ({ browser }) => {
  await fs.mkdir(outputDir, { recursive: true });
  for (const locale of locales) await captureLocale(browser, locale);
});
