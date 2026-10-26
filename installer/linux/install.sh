#!/bin/sh
# Browser Organizer — native host installer (Linux, portable fallback)
#
# TOOLCHAIN: none beyond a POSIX shell — this is the dependency-free fallback for
# users who can't (or don't want to) install a .deb/.rpm. It works on any distro.
#
# Unlike the .deb/.rpm (which drop the binary system-wide), this script installs
# entirely per-user: copies the SEA binary into ~/.browser-organizer, chmod 700,
# and runs `--install` so the binary registers the native-messaging manifest for
# Chrome and Edge pointing at itself. No root required.
#
# Usage:
#   ./install.sh                # install for chrome,edge
#   ./install.sh chrome         # install for a specific browser list
#   ./install.sh --uninstall    # remove
#
# Expects the SEA binary next to this script (as packaged in a release tarball)
# or at dist/host/browser-organizer-host in a repo checkout.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEST_DIR="$HOME/.browser-organizer"
DEST_BIN="$DEST_DIR/browser-organizer-host"

# Locate the binary: alongside this script (release tarball) or in dist/ (repo).
if [ -f "$SCRIPT_DIR/browser-organizer-host" ]; then
  SRC_BIN="$SCRIPT_DIR/browser-organizer-host"
elif [ -f "$SCRIPT_DIR/../../dist/host/browser-organizer-host" ]; then
  SRC_BIN="$SCRIPT_DIR/../../dist/host/browser-organizer-host"
else
  # Release assets: browser-organizer-host-<ver>-linux-install.sh sits next to
  # browser-organizer-host-<ver>-linux-<arch>. Prefer the binary with our own version.
  SELF_VER="$(basename "$0" | sed -n 's/^browser-organizer-host-\(.*\)-linux-install\.sh$/\1/p')"
  SRC_BIN=""
  if [ -n "$SELF_VER" ]; then
    for f in "$SCRIPT_DIR"/browser-organizer-host-"$SELF_VER"-linux-*; do
      case "$f" in *-install.sh|*.deb|*.rpm|*.txt) continue;; esac
      if [ -f "$f" ]; then SRC_BIN="$f"; break; fi
    done
  fi
  if [ -z "$SRC_BIN" ]; then
    for f in "$SCRIPT_DIR"/browser-organizer-host-*-linux-*; do
      case "$f" in *-install.sh|*.deb|*.rpm|*.txt) continue;; esac
      if [ -f "$f" ]; then SRC_BIN="$f"; break; fi
    done
  fi
fi
if [ -z "$SRC_BIN" ]; then
  echo "error: browser-organizer-host binary not found. Run 'npm run build:sea' or use a release tarball." >&2
  exit 1
fi

if [ "${1:-}" = "--uninstall" ]; then
  if [ -x "$DEST_BIN" ]; then
    "$DEST_BIN" --uninstall "${2:-chrome,edge}" || true
  fi
  rm -rf "$DEST_DIR"
  echo "Removed $DEST_DIR"
  exit 0
fi

BROWSERS="${1:-chrome,edge}"
mkdir -p "$DEST_DIR"
cp "$SRC_BIN" "$DEST_BIN"
chmod 700 "$DEST_BIN"
"$DEST_BIN" --install "$BROWSERS"
echo "Installed to $DEST_DIR — open the extension side panel and click the reload icon."
