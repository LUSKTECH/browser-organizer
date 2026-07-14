# Changelog

## Unreleased
**Native-host distribution**
- The helper now installs into a stable per-user home (`~/.browser-organizer`,
  `%LOCALAPPDATA%\BrowserOrganizer`) with the browser manifest pointing there — the
  repo/bundle/npx cache can be deleted after install. Added `repair` alongside install/uninstall.
- Directory-independent install for technical users: `npx @lusktech/browser-organizer-host`
  (dependency-free npm package; the installer relocated to `native-host/installer.js`). The
  extension ID is baked in (`native-host/paths.js`), so no arguments are needed.
- Standalone path for non-technical users: a Node SEA binary (`npm run build:sea`) that
  self-registers via `--install`/`--uninstall`, per-OS installer sources under `installer/`
  (Inno Setup / `.pkg` / `.deb`/`.rpm` / portable `install.sh`), and a signed/notarized
  release CI matrix (`.github/workflows/release-host.yml`).
- 256 unit tests + 21 Playwright E2E.

## 0.1.0 — 2026-07-11
First release.

**Features**
- Group open tabs by topic; detect forgotten/stale tabs (close or suspend, saving important
  ones first); auto-bookmark useful pages into tidy folders; clean duplicate/stale/dead
  bookmarks.
- Duplicate open-tab detection (local, no AI). Per-window or all-windows scope.
- Natural-language commands (side panel + `org` omnibox keyword). Save/restore named sessions.
- Scheduled auto-mode with one-click undo and an undo-history dialog. Whitelist + "never
  suggest this" learning.
- Six local AI CLI backends (Claude Code, Antigravity, Kiro, Copilot, Codex, Ollama) plus a
  host-side OpenAI-compatible API backend (OpenAI/OpenRouter/Groq/LM Studio/vLLM).

**Quality / security**
- Full security + concurrency audit remediation: serialized storage read-modify-write,
  single-flight scans, incremental undo persistence, native-host stdin-crash guard, URL
  credential/redaction hardening, SSRF guard for dead-link checks, no-shell installer.
- 231 unit tests + 20 Playwright E2E; ESLint (security-first `no-unsanitized`) gate; CI.

**Packaging**
- Store zip (`npm run package`) and self-host bundle (`npm run package:selfhost`).
- Generated 16/48/128 icons; native-host `uninstall` support.
