import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyWhitelist } from '../extension/lib/protections.js';

test('applyWhitelist normalises URL-shaped entries to their hostname', () => {
  const items = [
    { action: 'closeTab', data: { url: 'https://github.com/a' } },
    { action: 'closeTab', data: { url: 'https://gist.github.com/b' } },
    { action: 'closeTab', data: { url: 'https://example.org/c' } },
  ];
  assert.deepEqual(applyWhitelist(items, ['https://github.com/some/path']).map((i) => i.data.url), ['https://example.org/c']);
  assert.deepEqual(applyWhitelist(items, ['  GitHub.com ']).map((i) => i.data.url), ['https://example.org/c']);
  assert.equal(applyWhitelist(items, ['notgithub.com']).length, 3); // suffix match needs a dot boundary
});
