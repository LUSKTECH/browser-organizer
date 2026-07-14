import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseMode } from '../native-host/entry.js';

test('entry runs installer on --install, messaging loop otherwise', () => {
  assert.equal(chooseMode(['--install', 'chrome']).mode, 'install');
  assert.equal(chooseMode(['--uninstall']).mode, 'uninstall');
  assert.equal(chooseMode([]).mode, 'messaging');
});

test('bare args (browser launch) stay in the messaging loop', () => {
  // The browser launches the host with the manifest path and an origin arg.
  assert.equal(chooseMode(['chrome-extension://abc/']).mode, 'messaging');
});

test('--install wins even when combined with other args, in any position', () => {
  assert.equal(chooseMode(['chrome,edge', '--install']).mode, 'install');
  assert.equal(chooseMode(['--uninstall', 'chrome']).mode, 'uninstall');
});
