import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonBlock, parseGroupResult, parseStaleResult, parseImportantResult, parseCommandResult } from '../native-host/parse.js';

test('parseJsonBlock reads plain JSON', () => {
  assert.deepEqual(parseJsonBlock('{"a":1}'), { a: 1 });
});

test('parseJsonBlock strips a code fence', () => {
  assert.deepEqual(parseJsonBlock('```json\n{"a":1}\n```'), { a: 1 });
});

test('parseJsonBlock finds JSON amid prose', () => {
  assert.deepEqual(parseJsonBlock('Here you go: {"a":1} done'), { a: 1 });
});

test('parseJsonBlock throws when no JSON present', () => {
  assert.throws(() => parseJsonBlock('nothing here'), /No JSON/);
});

test('parseJsonBlock strips ANSI color codes and a leading label (kiro-shaped)', () => {
  const kiro = '[38;5;141m> [0m[1mjson\n[0m[38;5;10m{"groups":[{"name":"Dev","tabIds":[1]}]}\n[0m';
  assert.deepEqual(parseJsonBlock(kiro), { groups: [{ name: 'Dev', tabIds: [1] }] });
});

test('parseJsonBlock skips a leading bracketed log line (codex/copilot-shaped)', () => {
  const logged = '[2026-07-11 10:00] thinking...\n{"close":[{"tabId":5}]}';
  assert.deepEqual(parseJsonBlock(logged), { close: [{ tabId: 5 }] });
});

test('parseJsonBlock extracts a balanced object and ignores trailing text', () => {
  assert.deepEqual(parseJsonBlock('here: {"a":{"b":1}} -- done'), { a: { b: 1 } });
});

test('parseJsonBlock does not mistake a brace inside a string for the end', () => {
  assert.deepEqual(parseJsonBlock('{"name":"a}b","x":1} trailing'), { name: 'a}b', x: 1 });
});

test('parseGroupResult coerces tabIds to ints and drops empty groups', () => {
  const g = parseGroupResult('{"groups":[{"name":"A","color":"blue","tabIds":["1",2]},{"name":"B","tabIds":[]}]}');
  assert.deepEqual(g, [{ name: 'A', color: 'blue', tabIds: [1, 2] }]);
});

test('parseStaleResult defaults suggestBookmark to false and action to close', () => {
  const s = parseStaleResult('{"close":[{"tabId":5,"reason":"old"}]}');
  assert.deepEqual(s, [{ tabId: 5, reason: 'old', suggestBookmark: false, action: 'close' }]);
});

test('parseImportantResult keeps folderPath as string array', () => {
  const i = parseImportantResult('{"important":[{"tabId":9,"folderPath":["Dev","X"],"reason":"ref"}]}');
  assert.deepEqual(i, [{ tabId: 9, folderPath: ['Dev', 'X'], reason: 'ref' }]);
});

test('parseStaleResult preserves a suspend action', () => {
  const s = parseStaleResult('{"close":[{"tabId":5,"reason":"idle","action":"suspend"}]}');
  assert.equal(s[0].action, 'suspend');
});

test('parseCommandResult returns the three optional action arrays', () => {
  const r = parseCommandResult('{"close":[{"tabId":1,"reason":"travel"}],"groups":[],"important":[]}');
  assert.equal(r.close.length, 1);
  assert.deepEqual(r.groups, []);
  assert.deepEqual(r.important, []);
});
