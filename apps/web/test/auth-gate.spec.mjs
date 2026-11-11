import { expect, test } from '@playwright/test';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3000';

async function signIn(context) {
  await context.addCookies([{ name: 'eoh_session', value: 'test-session', url: baseUrl, httpOnly: true, sameSite: 'Lax' }]);
}

test('the public landing has no authenticated menu and language choice changes the hero copy', async ({ page }) => {
  await page.goto(baseUrl);
  await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /ikhaya lamabali|home for the stories/i })).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('link', { name: 'Start a family circle' })).toBeVisible();
});

test('the mobile menu is only available with a valid session', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl);
  await expect(page.getByRole('button', { name: /imenyu|menu/i })).toHaveCount(0);
  await signIn(context);
  await page.goto(`${baseUrl}/families`);
  await expect(page.getByRole('button', { name: /imenyu|menu/i })).toBeVisible();
});

test('a missing or expired session redirects directly to sign-in without protected content', async ({ page, context }) => {
  await page.goto(`${baseUrl}/families`);
  await expect(page).toHaveURL(/\/sign-in\?next=%2Ffamilies/);
  await expect(page.getByRole('heading', { name: /sign in with email|ngena nge-imeyile|qala nge-imeyile/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /families and storytellers|iintsapho nababalisi/i })).toHaveCount(0);

  await context.addCookies([{ name: 'eoh_session', value: 'expired-session', url: baseUrl, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto(`${baseUrl}/story`);
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fstory/);
  await expect(page.getByRole('heading', { name: /your approved story|ibali lakho/i })).toHaveCount(0);
});

test('a valid session renders authenticated navigation and survives a protected-route refresh', async ({ page, context }) => {
  await signIn(context);
  await page.goto(`${baseUrl}/families`);
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /families and storytellers|iintsapho nababalisi/i })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(`${baseUrl}/families`);
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
});

test('OTP verification creates a session, grants access, and logout removes it', async ({ page }) => {
  await page.goto(`${baseUrl}/sign-in?mode=sign-up&next=/profile`);
  await page.getByLabel(/email address|idilesi ye-imeyile/i).fill('demo@example.com');
  await page.getByRole('button', { name: /send me a code|ndithumele ikhowudi/i }).click();
  await expect(page).toHaveURL(/\/verify\?next=%2Fprofile/);
  await page.getByLabel(/six-digit code|ikhowudi enamanani amathandathu/i).fill('123456');
  await page.getByRole('button', { name: /verify and continue|qinisekisa uze uqhubeke/i }).click();
  await expect(page).toHaveURL(`${baseUrl}/profile`);
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await page.getByRole('button', { name: /sign out|phuma/i }).click();
  await expect(page).toHaveURL(`${baseUrl}/`);
  await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
  await page.goto(`${baseUrl}/profile`);
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fprofile/);
});
