import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('transcript review accessibility', () => {
  test('S-50 through S-53 have no axe violations', async ({ page }) => {
    await page.goto('/review');
    await expect(page.getByRole('heading', { name: /check the story|jonga ibali/i })).toBeVisible();
    const results = await new AxeBuilder({ page }).include('main').analyze();
    expect(results.violations).toEqual([]);
  });

  test('S-70 through S-91 reader and sharing shell have no axe violations', async ({ page }) => {
    await page.goto('/story');
    await expect(page.getByRole('heading', { name: /your approved story|ibali lakho/i })).toBeVisible();
    const results = await new AxeBuilder({ page }).include('main').analyze();
    expect(results.violations).toEqual([]);
  });
});
