import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('transcript review accessibility', () => {
  test('S-50 through S-53 have no axe violations', async ({ page }) => {
    await page.goto('/review');
    await expect(page.getByRole('heading', { name: /check the story/i })).toBeVisible();
    const results = await new AxeBuilder({ page }).include('main').analyze();
    expect(results.violations).toEqual([]);
  });
});
