import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STEPS, PROBE_ADAPTERS, PINNED_EXTENSION_ID, classifyHostError, isHostReachable, recommendAdapter,
  clampStep, normalizeState, pinHint, canOfferInstaller, backendInfo,
} from '../extension/lib/onboarding.js';

test('classifyHostError separates "not registered" from "ID not allowed" from a reachable helper error', () => {
  assert.equal(classifyHostError('Specified native messaging host not found.'), 'missing');
  assert.equal(classifyHostError('Native host disconnected'), 'missing');
  assert.equal(classifyHostError(''), 'missing');
  assert.equal(classifyHostError('Access to the specified native messaging host is forbidden.'), 'forbidden');
  assert.equal(classifyHostError('spawn claude ENOENT'), 'other');
  assert.equal(classifyHostError('OpenAI API 403'), 'other');
});

test('isHostReachable is true as soon as any reply carries a hostVersion', () => {
  assert.equal(isHostReachable({}), false);
  assert.equal(isHostReachable(undefined), false);
  assert.equal(isHostReachable({ claude: { ready: false, error: 'Specified native messaging host not found.' } }), false);
  assert.equal(isHostReachable({ claude: { ready: false, error: 'spawn claude ENOENT', hostVersion: '0.1.9' } }), true);
});

test('recommendAdapter prefers the first ready CLI in probe order, else the API', () => {
  assert.equal(recommendAdapter({ codex: { ready: true }, kiro: { ready: true } }), 'codex');
  assert.equal(recommendAdapter({ claude: { ready: true }, codex: { ready: true } }), 'claude');
  assert.equal(recommendAdapter({ ollama: { ready: true } }), 'ollama');
  assert.equal(recommendAdapter({ claude: { ready: false } }), 'openai');
  assert.equal(recommendAdapter(undefined), 'openai');
});

test('every probed adapter has a label and a kind', () => {
  for (const a of PROBE_ADAPTERS) {
    const b = backendInfo(a);
    assert.ok(b.label && ['cli', 'ollama', 'api'].includes(b.kind), a);
  }
});

test('normalizeState / clampStep tolerate junk and keep the step in range', () => {
  assert.deepEqual(normalizeState(undefined), { version: 1, completed: false, skipped: false, step: 0 });
  assert.deepEqual(normalizeState({ completed: true, step: 99 }), { version: 1, completed: true, skipped: false, step: STEPS.length - 1 });
  assert.deepEqual(normalizeState({ skipped: 'yes', step: -4 }), { version: 1, completed: false, skipped: false, step: 0 });
  assert.equal(clampStep(2.5), 0);
  assert.equal(clampStep(3), 3);
});

test('pinHint adapts to Edge vs Chrome', () => {
  assert.match(pinHint('Mozilla/5.0 Chrome/130 Safari/537.36 Edg/130.0'), /Show in toolbar/);
  assert.match(pinHint('Mozilla/5.0 Chrome/130 Safari/537.36'), /pin/);
});

test('the no-Node installer is offered only for the pinned store ID', () => {
  assert.equal(canOfferInstaller(PINNED_EXTENSION_ID), true);
  assert.equal(canOfferInstaller('jaaeoioghdombgmachhdemcchblnllph'), false);
});
