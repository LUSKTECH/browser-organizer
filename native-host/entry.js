// Dispatch layer shared by `node host.js` and the standalone SEA binary. The
// browser launches the host with the manifest path + an origin arg and expects
// the stdin/stdout native-messaging loop; the per-OS installers instead invoke
// the same binary with `--install` / `--uninstall` to self-register. Keeping the
// choice in one pure function makes the default (messaging) unmistakable.
export function chooseMode(argv) {
  if (argv.includes('--install')) return { mode: 'install' };
  if (argv.includes('--uninstall')) return { mode: 'uninstall' };
  return { mode: 'messaging' };
}
