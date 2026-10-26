# Privacy Policy: Browser Organizer

_Last updated: 2026-10-26_

Browser Organizer runs a helper program on your own computer, which invokes your
locally-installed AI CLI (Claude Code, Antigravity, Kiro, Copilot, Codex, or local Ollama)
or an OpenAI-compatible API endpoint you configure. That backend transmits some of your data
to its AI provider under your own subscription/key. This is not a "stays fully local" tool
unless you choose a local backend (Ollama, or a local OpenAI-compatible server). The
extension operator receives none of this data and operates no server that stores it.

- **What we access:** open tab titles/URLs, bookmarks, browsing-history visit times for
  bookmarked URLs, and HTTP status of bookmarked URLs (for dead-link checks).
- **What is sent to the AI provider:** open tab titles and URLs are sent to your selected
  backend to compute groupings, stale-tab suggestions, and bookmark recommendations. Before
  sending, the extension strips query strings and fragments, removes embedded credentials,
  and reduces private or loopback hosts to their origin. This happens under your own AI
  subscription/key and is subject to that provider's policy.
- **What stays local:** bookmarks, browsing history, and dead-link HTTP checks are
  processed entirely on your machine and are never sent anywhere.
- **What we store:** your settings (which features are on, your protected folders/domains,
  and your chosen AI backend) are saved using Chrome's built-in synced storage. If you have
  Chrome Sync turned on and haven't excluded extensions from what syncs (Chrome lets you
  toggle data types like Extensions individually under Sync settings), this follows you to
  your other signed-in Chrome browsers the same way your bookmarks or browser preferences
  do. That data passes through Google's Chrome Sync infrastructure, not through us. With
  Sync off, or with Extensions excluded from it, it stays on-device. Tab-activity
  timestamps, the undo log, and your API key (if you use the OpenAI-compatible API backend)
  are kept in local storage only and are never synced anywhere. The key is **encrypted at
  rest** (AES-GCM). None of it is ever sent to the extension developer; we operate no server
  that stores it.
- **What we never do:** sell data, run analytics, or transmit your data to the developer.

Contact: hello@lusk.dev

Policy URL: https://lusk.dev/browser-organizer/privacy
