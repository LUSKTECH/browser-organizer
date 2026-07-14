import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../native-host/cli.js';
import { PROD_EXTENSION_ID } from '../native-host/paths.js';

test('defaults: install for chrome+edge with the pinned id', () => {
  const a = parseArgs([]);
  assert.equal(a.cmd, 'install');
  assert.deepEqual(a.browsers, ['chrome', 'edge']);
  assert.equal(a.extensionId, PROD_EXTENSION_ID);
});

test('accepts a subcommand and a browser list', () => {
  assert.deepEqual(parseArgs(['uninstall', 'chrome']).browsers, ['chrome']);
  assert.equal(parseArgs(['repair']).cmd, 'repair');
});

test('accepts an explicit extension id override', () => {
  assert.equal(parseArgs(['install', 'chrome', 'abcdef']).extensionId, 'abcdef');
});
