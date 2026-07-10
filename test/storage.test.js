import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './helpers/chrome-mock.js';
import { DEFAULTS, getSettings, setSettings } from '../extension/lib/storage.js';

beforeEach(() => installChromeMock());

test('getSettings returns defaults when nothing stored', async () => {
  const s = await getSettings();
  assert.equal(s.automationMode, 'review');
  assert.equal(s.staleTabDays, DEFAULTS.staleTabDays);
  assert.equal(s.adapter, 'claude');
});

test('setSettings merges a patch over defaults', async () => {
  await setSettings({ automationMode: 'auto', staleTabDays: 30 });
  const s = await getSettings();
  assert.equal(s.automationMode, 'auto');
  assert.equal(s.staleTabDays, 30);
  assert.equal(s.adapter, 'claude'); // untouched default preserved
});

test('defaults include an empty ignore list', async () => {
  const s = await getSettings();
  assert.deepEqual(s.ignore, []);
});
