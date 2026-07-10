import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOST_NAME, manifestDir, buildHostManifest, buildLauncherScript, registryCommands, winManifestPath } from '../install/install.js';

test('manifestDir resolves per browser on linux', () => {
  const d = manifestDir('chrome', 'linux', '/home/u');
  assert.equal(d, '/home/u/.config/google-chrome/NativeMessagingHosts');
  assert.match(manifestDir('edge', 'linux', '/home/u'), /microsoft-edge/);
});

test('manifestDir resolves per browser on darwin', () => {
  assert.match(manifestDir('chrome', 'darwin', '/Users/u'), /Google\/Chrome\/NativeMessagingHosts/);
  assert.match(manifestDir('edge', 'darwin', '/Users/u'), /Microsoft Edge\/NativeMessagingHosts/);
});

test('manifestDir throws for unsupported combo', () => {
  assert.throws(() => manifestDir('safari', 'linux', '/home/u'), /Unsupported/);
});

test('buildHostManifest wires name, path, and allowed_origins', () => {
  const m = buildHostManifest({ execPath: '/x/run.sh', extensionId: 'abc123' });
  assert.equal(m.name, HOST_NAME);
  assert.equal(m.type, 'stdio');
  assert.equal(m.path, '/x/run.sh');
  assert.deepEqual(m.allowed_origins, ['chrome-extension://abc123/']);
});

test('unix launcher exports the CLI path and a PATH before exec', () => {
  const s = buildLauncherScript({ platform: 'linux', nodePath: '/usr/bin/node', hostEntry: '/x/host.js', cliPath: '/home/u/.local/bin/claude' });
  assert.match(s, /^#!\/bin\/sh/);
  assert.match(s, /BROWSER_ORGANIZER_CLI="\/home\/u\/\.local\/bin\/claude"/);
  assert.match(s, /export PATH=/);
  assert.match(s, /exec "\/usr\/bin\/node" "\/x\/host\.js"/);
});

test('registryCommands builds HKCU reg add for chrome and edge', () => {
  const cmds = registryCommands(['chrome', 'edge'], 'C:\\hosts\\com.browser_organizer.host.json');
  assert.equal(cmds.length, 2);
  assert.match(cmds[0], /HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com\.browser_organizer\.host/);
  assert.match(cmds[1], /Microsoft\\Edge/);
  assert.match(cmds[0], /C:\\hosts\\com\.browser_organizer\.host\.json/);
});

test('winManifestPath is under the native host dir', () => {
  assert.match(winManifestPath('C:\\ext\\native-host'), /native-host.*com\.browser_organizer\.host\.json$/);
});
