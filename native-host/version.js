import { readFileSync } from 'node:fs';

// The host's own package version, read from the package.json shipped alongside
// it (the installer copies package.json into the stable home). Returns 'unknown'
// when it can't be read — e.g. a SEA build, which has no package.json on disk.
export function hostVersion() {
  try {
    return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version || 'unknown';
  } catch {
    return 'unknown';
  }
}
