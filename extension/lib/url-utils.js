export function isHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

// Canonical form for duplicate detection: lowercase host, no hash, no trailing
// slash on the path. Query string is preserved (it can be semantically meaningful).
export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    let s = u.toString();
    if (u.pathname !== '/' && s.endsWith('/')) s = s.slice(0, -1);
    if (u.pathname === '/' && u.search === '') s = `${u.protocol}//${u.host}`;
    return s;
  } catch {
    return url;
  }
}

export function redactUrl(url) {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    u.username = ''; // never ship embedded basic-auth credentials to the model
    u.password = '';
    return u.toString();
  } catch {
    return url;
  }
}

// True for hosts that must not be sent to a remote model (egress coarsening) and
// must not be fetched by the dead-link checker (SSRF guard). Fails CLOSED:
// unparseable/ambiguous hosts are treated as private.
export function isPrivateHost(url) {
  let h;
  try { h = new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase(); }
  catch { return true; }
  if (!h) return true;
  if (h.includes(':')) { // IPv6: loopback, unique-local (fc00::/7), link-local (fe80::/10)
    return h === '::1' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h);
  }
  if (h === 'localhost' || h.endsWith('.local')) return true;
  if (h === '0.0.0.0') return true;
  // Non-dotted-decimal IPv4 encodings (decimal/hex integer hosts) can smuggle
  // internal targets past dotted-quad checks — treat any bare-integer host as private.
  if (/^0x[0-9a-f]+$/.test(h) || /^\d+$/.test(h)) return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  return false;
}
