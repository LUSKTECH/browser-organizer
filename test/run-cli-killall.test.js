import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { runCli, killAll } from '../native-host/adapters/run-cli.js';

test('killAll kills in-flight children and removes their temp dirs', async () => {
  let killed = 0;
  let cwd = null;
  const spawnFn = (command, args, options) => {
    cwd = options.cwd;
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { on() {}, write() {}, end() {} };
    child.kill = () => { killed += 1; child.emit('close', null); };
    return child;
  };
  const pending = runCli({ command: 'x', args: [], env: {}, timeoutMs: 60000, spawnFn });
  pending.catch(() => {});
  assert.ok(fs.existsSync(cwd), 'temp dir exists while running');
  killAll();
  assert.equal(killed, 1);
  assert.equal(fs.existsSync(cwd), false);
});
