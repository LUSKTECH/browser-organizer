import { test, expect } from './fixtures.mjs';

// "Extension options" (edge://extensions → Details) opens options_ui.page in a tab.
test('the options page opens with the settings section expanded', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html#settings`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('details#settings')).toHaveAttribute('open', '');
  await expect(page.locator('#settingsForm')).toBeVisible();
});
