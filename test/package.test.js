import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { buildPackage } from '../scripts/package.mjs';

// Minimal reader for the zips this repo writes: walks the central directory and inflates entries.
function readZip(file) {
  const buf = fs.readFileSync(file);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const dataStart = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    out.set(name, zlib.inflateRawSync(buf.subarray(dataStart, dataStart + compSize)).toString('utf8'));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function withTmp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bo-pkg-'));
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('store zip strips the manifest key and excludes launchers and dotfiles', () => {
  withTmp((dir) => {
    const { outPath, entries, manifestText } = buildPackage({ mode: 'store', outDir: dir });
    const zip = readZip(outPath);
    assert.deepEqual([...zip.keys()], entries);
    const manifest = JSON.parse(zip.get('manifest.json'));
    assert.equal('key' in manifest, false);
    assert.equal(JSON.parse(manifestText).key, undefined);
    for (const name of zip.keys()) {
      const base = name.split('/').pop();
      assert.ok(!['run.sh', 'run.bat'].includes(base), `${name} must not ship`);
      assert.ok(!base.startsWith('.'), `${name} is a dotfile`);
    }
  });
});

test('selfhost zip keeps the manifest key and still excludes launchers', () => {
  withTmp((dir) => {
    const { outPath } = buildPackage({ mode: 'selfhost', outDir: dir });
    const zip = readZip(outPath);
    const manifest = JSON.parse(zip.get('extension/manifest.json'));
    assert.ok(manifest.key, 'selfhost manifest must keep the key');
    assert.ok(zip.has('native-host/host.js'));
    for (const name of zip.keys()) {
      const base = name.split('/').pop();
      assert.ok(!['run.sh', 'run.bat'].includes(base), `${name} must not ship`);
    }
  });
});
