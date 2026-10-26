import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'installer', 'linux', 'install.sh');

// The release job renames the script and binary to versioned names and ships them as
// separate assets; the portable installer must find the binary under those names.
test('install.sh finds the versioned release binary next to itself', { skip: process.platform === 'win32' }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bo-installsh-'));
  try {
    const rel = path.join(tmp, 'rel');
    const home = path.join(tmp, 'home');
    fs.mkdirSync(rel);
    fs.mkdirSync(home);
    const script = path.join(rel, 'browser-organizer-host-1.2.3-linux-install.sh');
    fs.copyFileSync(SRC, script);
    // A stale binary from another version must not be picked.
    fs.writeFileSync(path.join(rel, 'browser-organizer-host-0.0.1-linux-x64'), '#!/bin/sh\necho old\n', { mode: 0o755 });
    fs.writeFileSync(path.join(rel, 'browser-organizer-host-1.2.3-linux-x64'), '#!/bin/sh\necho new\nexit 0\n', { mode: 0o755 });
    const r = spawnSync('sh', [script], {
      env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') },
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    const dest = path.join(home, '.browser-organizer', 'browser-organizer-host');
    assert.ok(fs.existsSync(dest));
    assert.match(fs.readFileSync(dest, 'utf8'), /echo new/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
