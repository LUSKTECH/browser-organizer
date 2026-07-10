import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHttpUrl, normalizeUrl, redactUrl, isPrivateHost } from '../extension/lib/url-utils.js';

test('isHttpUrl accepts http/https, rejects chrome/file', () => {
  assert.equal(isHttpUrl('https://a.com'), true);
  assert.equal(isHttpUrl('http://a.com'), true);
  assert.equal(isHttpUrl('chrome://extensions'), false);
  assert.equal(isHttpUrl('file:///x'), false);
  assert.equal(isHttpUrl(''), false);
  assert.equal(isHttpUrl(undefined), false);
});

test('normalizeUrl drops trailing slash, hash, and lowercases host', () => {
  assert.equal(normalizeUrl('https://Example.com/Path/'), 'https://example.com/Path');
  assert.equal(normalizeUrl('https://example.com/p#frag'), 'https://example.com/p');
  assert.equal(normalizeUrl('https://example.com'), 'https://example.com');
});

test('normalizeUrl treats duplicates the same', () => {
  assert.equal(normalizeUrl('https://X.com/a/'), normalizeUrl('https://x.com/a#top'));
});

test('normalizeUrl returns input unchanged when unparseable', () => {
  assert.equal(normalizeUrl('not a url'), 'not a url');
});

test('redactUrl strips query and fragment, keeps origin and path', () => {
  assert.equal(redactUrl('https://a.com/p/q?token=secret#frag'), 'https://a.com/p/q');
  assert.equal(redactUrl('https://a.com/'), 'https://a.com/');
  assert.equal(redactUrl('not a url'), 'not a url');
});

test('isPrivateHost flags loopback and RFC-1918 ranges', () => {
  assert.equal(isPrivateHost('http://localhost/x'), true);
  assert.equal(isPrivateHost('http://127.0.0.1/x'), true);
  assert.equal(isPrivateHost('http://192.168.1.1/'), true);
  assert.equal(isPrivateHost('http://10.0.0.5/'), true);
  assert.equal(isPrivateHost('https://example.com/'), false);
});
