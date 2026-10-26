import { test, expect } from './fixtures.mjs';

// First-run wizard (extension/welcome). The fixture installs the real host, so the helper step
// connects and the Claude CLI probe reflects this machine; the flow is driven through the
// OpenAI-compatible path, which needs no CLI.
test.describe.configure({ mode: 'serial' });

async function openWizard(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/welcome/welcome.html`, { waitUntil: 'domcontentloaded' });
  return page;
}

test('a fresh install opens the wizard once and records onboarding state', async ({ context, extensionId, panel }) => {
  const state = await panel.evaluate(() => chrome.storage.local.get('onboarding'));
  expect(state.onboarding).toMatchObject({ completed: false, skipped: false });
  // The fixture closed the auto-opened tab; opening the page again works and starts at step 1.
  const page = await openWizard(context, extensionId);
  await expect(page.locator('#progress')).toHaveText('Step 1 of 6');
  await expect(page.locator('#pinHint')).toContainText('Extensions');
});

test('walks welcome → helper → backend → API setup, validates the key, and saves choices', async ({ context, extensionId, panel }) => {
  const page = await openWizard(context, extensionId);
  await page.locator('#next').click();                                   // → helper
  await expect(page.locator('#helperStatus')).toContainText('Helper found');
  await page.locator('#next').click();                                   // → backend
  await expect(page.locator('#backendCards label')).toHaveCount(7);
  await page.getByLabel(/OpenAI-compatible API/).check();
  await page.locator('#next').click();                                   // → setup (API form)
  await expect(page.locator('#setupTitle')).toHaveText('Set up OpenAI-compatible API');
  await page.locator('#next').click();                                   // no key yet → blocked
  await expect(page.locator('#setupMsg')).toHaveText('Enter an API key to continue.');
  await page.locator('#apiBase').fill('http://127.0.0.1:9/v1');
  await page.locator('#apiKey').fill('sk-test-not-real');
  await page.locator('#next').click();                                   // saves → test
  await expect(page.locator('#progress')).toHaveText('Step 5 of 6');
  const s = (await panel.evaluate(async () => (await chrome.storage.sync.get('settings')).settings)) || {};
  // Nothing is committed until the check passes; this one fails, so the saved config is untouched.
  expect(s.openaiBaseUrl || '').toBe('');
  // The choice is only made active once its check passes; this one fails, so the default stays.
  expect(s.adapter ?? 'claude').toBe('claude');
  // The unreachable endpoint must surface as a failed check, not a silent pass.
  await expect(page.locator('#testHealth')).toHaveClass(/bad/);
  await expect(page.locator('#next')).toBeDisabled();
  // The key is stored encrypted, never in the synced settings.
  expect(JSON.stringify(s)).not.toContain('sk-test-not-real');
});

test('Skip setup marks it skipped and lands on the done step; reopening starts over', async ({ context, extensionId, panel }) => {
  const page = await openWizard(context, extensionId);
  await page.locator('#skip').click();
  await expect(page.locator('#doneTitle')).toHaveText('Setup skipped');
  const st = await panel.evaluate(() => chrome.storage.local.get('onboarding'));
  expect(st.onboarding.skipped).toBe(true);
  const again = await openWizard(context, extensionId);
  await expect(again.locator('#progress')).toHaveText('Step 1 of 6');
});

test('the side panel offers Set up… and Run setup again', async ({ context, panel }) => {
  await expect(panel.locator('#rerunSetup')).toBeAttached();
  const [wizard] = await Promise.all([
    context.waitForEvent('page'),
    panel.evaluate(() => document.getElementById('rerunSetup').click()),
  ]);
  await wizard.waitForLoadState('domcontentloaded');
  expect(wizard.url()).toContain('/welcome/welcome.html');
});

test('API path end to end: health goes green and Test sign-in gets an answer', async ({ context, extensionId, server }) => {
  const page = await openWizard(context, extensionId);
  await page.locator('#next').click();                                   // → helper
  await expect(page.locator('#helperStatus')).toContainText('Helper found');
  await page.locator('#next').click();                                   // → backend
  await page.getByLabel(/OpenAI-compatible API/).check();
  await page.locator('#next').click();                                   // → setup
  await page.locator('#apiBase').fill(`${server}/v1`);
  await page.locator('#apiModel').fill('test-model');
  await page.locator('#apiKey').fill('test-key-123');
  await page.locator('#next').click();                                   // → test
  await expect(page.locator('#testHealth')).toHaveClass(/ok/, { timeout: 15000 });
  await expect(page.locator('#next')).toBeEnabled();
  await page.locator('#testSignIn').click();
  await expect(page.locator('#testResult')).toContainText('Sign-in works', { timeout: 30000 });
  await page.locator('#next').click();                                   // → done
  await expect(page.locator('#doneTitle')).toHaveText("You're set");
  // #doneTitle has static text, so wait for the done step to actually record completion.
  await expect.poll(() => page.evaluate(async () => (await chrome.storage.local.get('onboarding')).onboarding)).toMatchObject({ completed: true, skipped: false });
  const saved = await page.evaluate(async () => (await chrome.storage.sync.get('settings')).settings);
  expect(saved.adapter).toBe('openai'); // activated after the check passed
  expect(saved.openaiBaseUrl).toBe(`${server}/v1`); // address and model are committed with it
  expect(saved.openaiModel).toBe('test-model');
});
