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
    return u.toString();
  } catch {
    return url;
  }
}

export function isPrivateHost(url) {
  try {
    const h = new URL(url).hostname;
    if (h === 'localhost' || h.endsWith('.local')) return true;
    if (/^127\./.test(h) || h === '::1') return true;
    if (/^10\./.test(h)) return true;
    if (/^192\.168\./.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    if (/^169\.254\./.test(h)) return true;
    return false;
  } catch { return false; }
}
