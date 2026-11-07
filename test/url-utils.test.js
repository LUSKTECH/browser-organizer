import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHttpUrl, normalizeUrl, dupeKey, redactUrl, isPrivateHost } from '../extension/lib/url-utils.js';

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

test('redactUrl strips embedded basic-auth credentials', () => {
  assert.equal(redactUrl('https://admin:secret@host.com/p?q=1'), 'https://host.com/p');
  assert.equal(redactUrl('https://user@host.com/'), 'https://host.com/');
});

test('isPrivateHost flags loopback and RFC-1918 ranges', () => {
  assert.equal(isPrivateHost('http://localhost/x'), true);
  assert.equal(isPrivateHost('http://127.0.0.1/x'), true);
  assert.equal(isPrivateHost('http://192.168.1.1/'), true);
  assert.equal(isPrivateHost('http://10.0.0.5/'), true);
  assert.equal(isPrivateHost('https://example.com/'), false);
});

test('isPrivateHost flags IPv6 ULA/link-local, 0.0.0.0, and encoded IPv4; fails closed', () => {
  assert.equal(isPrivateHost('http://[::1]/'), true);          // v6 loopback
  assert.equal(isPrivateHost('http://[fd00::1]/'), true);      // v6 ULA
  assert.equal(isPrivateHost('http://[fe80::1]/'), true);      // v6 link-local
  assert.equal(isPrivateHost('http://[2606:4700::1111]/'), false); // public v6
  assert.equal(isPrivateHost('http://0.0.0.0/'), true);
  assert.equal(isPrivateHost('http://2130706433/'), true);     // decimal 127.0.0.1
  assert.equal(isPrivateHost('http://0x7f000001/'), true);     // hex 127.0.0.1
  assert.equal(isPrivateHost('not a url'), true);              // fail closed
  assert.equal(isPrivateHost('http://fcbarcelona.com/'), false); // 'fc' hostname is NOT v6 ULA
});

test('isPrivateHost catches IPv4-mapped/embedded IPv6 (SSRF guard)', () => {
  // Mapped/embedded forms of internal targets must be treated as private —
  // otherwise the dead-link scanner could reach cloud metadata / loopback.
  assert.equal(isPrivateHost('http://[::ffff:169.254.169.254]/latest/meta-data/'), true);
  assert.equal(isPrivateHost('http://[::ffff:127.0.0.1]/'), true);
  assert.equal(isPrivateHost('http://[::ffff:10.0.0.1]/'), true);
  assert.equal(isPrivateHost('http://[64:ff9b::a9fe:a9fe]/'), true); // NAT64 → 169.254.169.254
  assert.equal(isPrivateHost('http://[::]/'), true);                 // unspecified
  // A genuinely public address (even in mapped form) stays public.
  assert.equal(isPrivateHost('http://[::ffff:8.8.8.8]/'), false);
  assert.equal(isPrivateHost('https://[2606:4700:4700::1111]/'), false);
});

test('isPrivateHost flags *.localhost and the CGNAT range 100.64.0.0/10', () => {
  assert.equal(isPrivateHost('http://foo.localhost:8080/token/abc'), true);
  assert.equal(isPrivateHost('http://100.64.0.1/'), true);
  assert.equal(isPrivateHost('http://100.127.255.254/'), true);
  assert.equal(isPrivateHost('http://100.128.0.1/'), false);
  assert.equal(isPrivateHost('http://100.63.255.255/'), false);
  assert.equal(isPrivateHost('https://notlocalhost.example/'), false);
});

const DUPE_KEY_CASES = [
  ['utm_ prefix, any suffix', 'https://a.com/p?utm_source=x&utm_whatever=1', 'https://a.com/p'],
  ['mixed-case UTM_Source', 'https://a.com/p?UTM_Source=x', 'https://a.com/p'],
  ['fbclid', 'https://a.com/p?fbclid=1', 'https://a.com/p'],
  ['gclid', 'https://a.com/p?gclid=1', 'https://a.com/p'],
  ['dclid', 'https://a.com/p?dclid=1', 'https://a.com/p'],
  ['msclkid', 'https://a.com/p?msclkid=1', 'https://a.com/p'],
  ['mc_cid', 'https://a.com/p?mc_cid=1', 'https://a.com/p'],
  ['mc_eid', 'https://a.com/p?mc_eid=1', 'https://a.com/p'],
  ['igshid', 'https://a.com/p?igshid=1', 'https://a.com/p'],
  ['yclid', 'https://a.com/p?yclid=1', 'https://a.com/p'],
  ['_hsenc', 'https://a.com/p?_hsenc=1', 'https://a.com/p'],
  ['_hsmi', 'https://a.com/p?_hsmi=1', 'https://a.com/p'],
  ['mixed-case FBCLID', 'https://a.com/p?FBCLID=1', 'https://a.com/p'],
  ['params are sorted', 'https://a.com/p?b=2&a=1', 'https://a.com/p?a=1&b=2'],
  ['non-tracking param kept, tracking dropped', 'https://a.com/p?id=7&utm_source=x', 'https://a.com/p?id=7'],
  ['ref, source, page and q are kept', 'https://a.com/p?q=z&page=2&source=s&ref=r', 'https://a.com/p?page=2&q=z&ref=r&source=s'],
  ['fragment ignored', 'https://a.com/p?a=1#top', 'https://a.com/p?a=1'],
  ['trailing slash ignored', 'https://a.com/p/?a=1', 'https://a.com/p?a=1'],
  ['all params removed leaves no ?', 'https://a.com/p?utm_source=x&fbclid=1', 'https://a.com/p'],
  ['all params removed at the root', 'https://A.com/?gclid=1', 'https://a.com'],
];
for (const [name, input, expected] of DUPE_KEY_CASES) {
  test(`dupeKey: ${name}`, () => assert.equal(dupeKey(input), expected));
}

test('dupeKey makes ?a=1&b=2 and ?b=2&a=1 equal, and leaves normalizeUrl alone', () => {
  assert.equal(dupeKey('https://a.com/p?a=1&b=2'), dupeKey('https://a.com/p?b=2&a=1'));
  assert.equal(normalizeUrl('https://a.com/p?utm_source=x'), 'https://a.com/p?utm_source=x');
});

test('dupeKey returns an invalid URL unchanged', () => {
  assert.equal(dupeKey('not a url'), 'not a url');
});
