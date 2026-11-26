import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyWhitelist, isProtectedHost } from '../extension/lib/protections.js';

test('applyWhitelist normalises URL-shaped entries to their hostname', () => {
  const items = [
    { action: 'closeTab', data: { url: 'https://github.com/a' } },
    { action: 'closeTab', data: { url: 'https://gist.github.com/b' } },
    { action: 'closeTab', data: { url: 'https://example.org/c' } },
  ];
  assert.deepEqual(applyWhitelist(items, ['https://github.com/some/path']).map((i) => i.data.url), ['https://example.org/c']);
  assert.deepEqual(applyWhitelist(items, ['  GitHub.com ']).map((i) => i.data.url), ['https://example.org/c']);
  assert.equal(applyWhitelist(items, ['notgithub.com']).length, 3); // suffix match needs a dot boundary
});

test('whitelist entries: ports, wildcards, trailing slash, punycode and IPv6 normalise to the URL parser form', () => {
  const cases = [
    // [entry, url, protected?]
    ['localhost:3000', 'http://localhost:3000/app', true],
    ['localhost:3000', 'http://localhost:4000/app', false],
    ['localhost:3000', 'http://localhost/app', false],
    ['localhost', 'http://localhost:4000/app', true], // no port in the entry: any port
    ['github.com:443', 'https://github.com/x', true], // a default port counts as 80/443
    ['github.com:443', 'https://gist.github.com/x', true],
    ['github.com:443', 'http://github.com/x', false],
    ['github.com/', 'https://github.com/x', true],
    ['*.github.com', 'https://github.com/x', true],
    ['*.github.com', 'https://gist.github.com/x', true],
    ['.github.com', 'https://gist.github.com/x', true],
    ['bücher.de', 'https://xn--bcher-kva.de/x', true],
    ['xn--bcher-kva.de', 'https://bücher.de/x', true],
    ['[::1]', 'http://[::1]/x', true],
    ['http://[::1]:8080/', 'http://[::1]:8080/x', true],
    ['http://[::1]:8080/', 'http://[::1]:9090/x', false],
    ['github.com', 'https://notgithub.com/x', false],
    ['*.github.com', 'https://notgithub.com/x', false],
  ];
  for (const [entry, url, want] of cases) {
    assert.equal(isProtectedHost(url, [entry]), want, `${entry} vs ${url}`);
    const dropped = applyWhitelist([{ action: 'closeTab', data: { url } }], [entry]).length === 0;
    assert.equal(dropped, want, `applyWhitelist ${entry} vs ${url}`);
  }
});
