# Onboarding wizard — design

_2026-10-12 · Status: draft for approval_

## Why

A new install of Browser Organizer does nothing visible. The extension lives in the toolbar's
extensions menu, so people don't know it exists or how to open it. Once they do open the side
panel, nothing works until two things are in place: the local helper (native messaging host)
is registered, and an AI backend is chosen and set up. Today that is one card with an `npx`
command and a hint to "pick your backend in Settings below". People have to work out the rest.

The goal is that someone who just installed the extension can get from "what is this?" to a
green "connected" state and their first Analyze, in one guided flow, without reading docs.

## Goals

1. After a fresh install, the user is shown where the extension is and how to open it.
2. A guided flow gets the helper registered, a backend chosen and configured, and the connection
   verified (green) before the user leaves.
3. The flow detects what it can (helper present? which CLIs are installed and ready?) so the user
   only does what is actually missing.
4. The wizard is skippable at every step and can be reopened later.
5. Same safety posture as the rest of the extension: no new permissions, no telemetry, no
   network calls other than to the backend the user picks.

## Non-goals

- Installing AI CLIs for the user, or running terminal commands for them (an extension cannot).
- Creating accounts or signing the user in to any provider.
- A demo / fake-backend mode (a separate feature, may come later).
- Replacing Settings. The wizard writes the same settings Settings shows.
- Firefox or Safari.

## Anti-goals (a failure even if it technically works)

- Nagging: the wizard never reopens by itself after it is finished or skipped.
- Showing the wizard to existing users who update.
- Trapping the user: every step has Skip / Back, and closing the tab loses nothing important.
- Sending tab data anywhere during setup other than the chosen provider (the connection test
  must not include real tab titles or URLs).

## What exists today (build on it)

- Side panel (`extension/sidepanel/`): one page with collapsible sections; `health-view.js`
  runs `checkHealth()` and shows `#onboarding` ("Connect your AI CLI", `installCommand()`, Copy,
  "Recheck connection") when the host is not reachable.
- `manifest.json` has `options_ui` → `sidepanel/sidepanel.html#settings` (opens in a tab).
- Host `health` message is **per adapter** (`msg.adapter`) and returns
  `{adapter, ready, version | error, hostVersion, capabilities: {adapters: [...]}}`. So once the
  helper is reachable, the extension can probe every adapter's readiness.
- Backends: `claude`, `antigravity`, `kiro`, `copilot`, `codex`, `ollama` (local CLIs) and
  `openai` (OpenAI-compatible API: base URL, key, model; the key is stored encrypted in
  `chrome.storage.local`). Settings live in `chrome.storage.sync`; local-only state in
  `chrome.storage.local`.
- Strings go through `data-i18n` / `_locales/en`. The UI targets WCAG 2.1 AA.
- `installCommand(extensionId)` already builds `npx @lusktech/browser-organizer-host install chrome,edge <id>`
  with the live extension ID, so unpacked installs work.

## The flow

A dedicated full-tab page, `extension/welcome/welcome.html`, reusing `dom.js`, `viewmodel.js`,
the storage helpers and the existing CSS tokens. Opened automatically on first install and
reopenable from Settings ("Run setup again") and from the side panel's connect card
("Set up…" button, since the panel is too narrow for the wizard).

1. **Welcome / find me.** What it does in two sentences, how to pin it (Chrome: puzzle icon →
   pin; Edge: puzzle icon → "Show in toolbar"; text adapts to the browser), the shortcut
   (`Ctrl+Shift+O` to analyze), and an **Open the panel** button (`chrome.sidePanel.open`, which
   needs this click as the user gesture).
2. **Helper.** Probe the host. Connected → show "Helper found (v…)" and continue. Not connected →
   show the one-line command with the live extension ID, Copy, and **Recheck**; explain it needs
   Node 20+ or offer the per-OS installer link as the no-Node route. Distinguish "helper not
   registered" from "helper registered but this extension ID is not allowed" if the error text
   allows it (then tell the user to re-run the command, which registers their ID).
3. **Choose a backend.** Cards for each backend, with a **Ready** badge from probing every adapter's
   `health`, a "Recommended" mark on the first ready one (else on the OpenAI-compatible API,
   which needs nothing installed), and a one-line description each. Nothing is pre-saved until
   the user picks.
4. **Set it up.** Content depends on the choice:
   - local CLI not ready: how to install and sign in (link to the vendor's page, the exact
     command where one exists), then **Recheck**;
   - Ollama: install link, `ollama pull llama3.2`, Recheck;
   - OpenAI-compatible: base URL, model, API key fields (same validation, same encrypted storage
     as Settings; show the privacy note that tab titles/URLs go to that endpoint).
5. **Test.** Two levels, both on the chosen backend. `health` runs automatically: for a CLI it
   proves the binary is installed (it runs `--version` only), for the OpenAI-compatible API it
   proves the key works (`GET /models`, no tokens spent). A separate **Test sign-in** button, only
   the user can press, sends one constant prompt with no user data ("Reply with OK") through the
   host's existing `prompt` passthrough, which every adapter supports; this is the only way to
   catch a CLI that is installed but not signed in. Green on success; on failure show the host's
   error in plain words and a Back button.
6. **Done.** Recap: what is sent where (tab titles and URLs to the chosen provider only),
   how to open the panel and the shortcut, and **Analyze my tabs** (opens the panel).

Progress is shown as "Step n of 6" with a visible, keyboard-reachable Back and Skip on every step.

## State

`chrome.storage.local.onboarding = { version: 1, completed: boolean, skipped: boolean, step: number }`.
Local, not synced: the helper is per machine, so a synced "completed" flag would hide the wizard
on a computer where nothing is set up. Choosing a backend writes the existing settings keys.

## Triggers

- `chrome.runtime.onInstalled` with `reason === 'install'`: open `welcome/welcome.html` in a new
  tab (once). `reason === 'update'` never opens it.
- If the wizard was never completed and the side panel finds the helper missing, the connect card
  gains a "Set up…" button. It does not open the tab by itself.
- "Run setup again" in Settings resets `completed` and opens the page.

## Constraints and things to watch

- **e2e suite:** Playwright launches the extension fresh, so `onInstalled` would open an extra tab
  in every existing spec. The builder must keep the 23 existing specs working (for example by
  making the auto-open skippable through a flag the fixtures set before install, or by closing the
  tab in the fixture), and add specs for the wizard itself.
- No new manifest permissions. `chrome.sidePanel.open` is already permitted.
- Store reviewers see a tab opening on install; keep the page clearly the product's own onboarding
  and update the store test instructions and privacy page only if behavior they describe changes.
- The wizard stays a plain-HTML module page like the rest (no framework, no new dependency).
- Strings in `_locales/en/messages.json`; WCAG 2.1 AA (focus order, labels, contrast, live
  region for test results), light and dark like the panel.
- The connection test prompt is a constant, contains no user data, and goes through the existing
  host `prompt` passthrough or the adapter `health`; do not add a new host message type unless
  needed (a host change means a host release).

## Decisions made so far

- The user asked for: help finding the extension after install, and asking which backend to use
  and how to set it up. Everything else in this document is my proposal.
- (My call) Helper first, then backend choice: every backend, including the API key one, runs
  through the helper, and probing which CLIs are ready needs it.
- (My call) Auto-detect and recommend, but never save a backend without the user choosing it.
- (My call) Open the wizard in a tab on first install only.
- (My call) The wizard explains and verifies; it does not run anything on the user's machine.

## Resolved by the builder check (my calls, flagged for review)

- **Connection test:** as in step 5. No host change and no host release are needed.
- **Probing is safe:** CLI `health` is `--version` (no auth flow, no UI). Probe all adapters in
  parallel with a short timeout each; probe the API adapter only if a key is already saved.
- **Helper errors:** Chrome reports "host not found" and "access to the host is forbidden"
  (ID not allowed) with different `chrome.runtime.lastError` text. Show two messages when those
  strings are seen (forbidden → re-run the command, which registers this extension's ID) and one
  generic message otherwise.
- **No-Node route:** the prebuilt per-OS installers register only the pinned store ID, so offer
  that route (GitHub release page, noting the installers are unsigned) only when
  `chrome.runtime.id` equals the pinned ID; otherwise say Node 20+ is required.
- **e2e:** fixture-only. The fixture closes the welcome tab opened on install; no production-side
  test flag.
- **"Set up…" button:** shown on the side panel's connect card whenever the helper is missing,
  regardless of `skipped` and including existing users (it is user-initiated, so it is not
  nagging). The wizard itself never opens by itself except on first install.
- **`sidePanel.open`:** called with the current window's id from the button click. If it throws
  in a tab context, fall back to text telling the user to click the toolbar icon.
- **Resume:** reopening a not-completed wizard resumes at the saved step (each step re-checks
  live state); "Run setup again" resets to step 1.

## Left to the builder

Visual design within the existing tokens, exact copy, the step state machine's shape, how the
probe is parallelised and timed out, how the e2e flag works, file layout under `extension/welcome/`.

## Success

A first-time user on a clean Chrome or Edge profile, with Node installed, reaches a green test and
clicks Analyze on the first run without opening any documentation, and a user who has no AI CLI
can finish with an OpenAI-compatible key in under two minutes.
