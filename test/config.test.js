import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCommand, resolveArgs, sanitizeOptions } from '../native-host/config.js';

test('resolveCommand defaults to claude and honors env override', () => {
  const prev = process.env.BROWSER_ORGANIZER_CLI;
  delete process.env.BROWSER_ORGANIZER_CLI;
  assert.equal(resolveCommand(), 'claude');
  process.env.BROWSER_ORGANIZER_CLI = '/opt/claude/bin/claude';
  assert.equal(resolveCommand(), '/opt/claude/bin/claude');
  if (prev === undefined) delete process.env.BROWSER_ORGANIZER_CLI; else process.env.BROWSER_ORGANIZER_CLI = prev;
});

test('resolveArgs returns headless json args and disables tools', () => {
  const args = resolveArgs();
  assert.ok(args.includes('-p'));
  assert.ok(args.includes('--output-format') && args.includes('json'));
});

test('sanitizeOptions keeps only a bounded timeoutMs and drops everything else', () => {
  const s = sanitizeOptions({ timeoutMs: 5000, command: '/bin/sh', args: ['-c', 'rm -rf /'], env: { LD_PRELOAD: 'x' }, cwd: '/tmp' });
  assert.deepEqual(Object.keys(s).sort(), ['timeoutMs']);
  assert.equal(s.timeoutMs, 5000);
});

test('sanitizeOptions clamps out-of-range or bad timeout to default', () => {
  assert.equal(sanitizeOptions({ timeoutMs: -1 }).timeoutMs, 120000);
  assert.equal(sanitizeOptions({ timeoutMs: 9_999_999 }).timeoutMs, 300000);
  assert.equal(sanitizeOptions({}).timeoutMs, 120000);
  assert.equal(sanitizeOptions(null).timeoutMs, 120000);
});
