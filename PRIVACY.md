# Privacy Policy: Browser Organizer

_Last updated: 2026-11-08_

Browser Organizer runs a helper program on your own computer, which invokes your
locally-installed AI CLI (Claude Code, Antigravity, Kiro, Copilot, Codex, or local Ollama)
or an OpenAI-compatible API endpoint you configure. That backend transmits some of your data
to its AI provider under your own subscription/key. This is not a "stays fully local" tool
unless you choose a local backend (Ollama, or a local OpenAI-compatible server). The
extension operator receives none of this data and operates no server that stores it.

- **What we access:** open tab titles/URLs, bookmarks, browsing-history visit times for
  bookmarked URLs, and HTTP status of bookmarked URLs (for dead-link checks).
- **What is sent to the AI provider:** open tab titles and URLs are sent to your selected
  backend to compute groupings, stale-tab suggestions, bookmark recommendations, and typed
  commands; for a typed command, the text you type is sent as well. If you turn on "Sort
  bookmarks" (off by default), the title, URL, folder path and browser-assigned ID of each
  bookmark being sorted are also sent, along with your folder names and their IDs (the IDs
  let the extension map suggestions back to your bookmarks). When you reject the same
  suggestion twice, a short "don't suggest" note is added to later requests so it stays
  away; it can contain a cleaned link, a group name or a bookmark ID. Before
  sending, the extension strips query strings and fragments, removes embedded credentials,
  and reduces private or loopback hosts to their origin. Protected folders, the Bookmarks Bar
  (while "Never touch the Bookmarks Bar" is on), and protected domains are never sent. This
  happens under your own AI subscription/key and is subject to that provider's policy.
- **What stays local:** browsing history (only visit times are read, on your machine),
  dead-link checks (plain HTTP requests from your browser to the bookmarked sites themselves),
  grouping rules, duplicate removal, snoozing, and bookmark backups are processed entirely on
  your machine. None of that is sent to an AI provider. Bookmarks are sent only by "Sort
  bookmarks", as described above.
- **What we store:** your settings (which features are on, your protected folders/domains,
  and your chosen AI backend) are saved using Chrome's built-in synced storage. If you have
  Chrome Sync turned on and haven't excluded extensions from what syncs (Chrome lets you
  toggle data types like Extensions individually under Sync settings), this follows you to
  your other signed-in Chrome browsers the same way your bookmarks or browser preferences
  do. That data passes through Google's Chrome Sync infrastructure, not through us. With
  Sync off, or with Extensions excluded from it, it stays on-device. Tab-activity
  timestamps, the undo log, snoozed tabs (title, URL, wake time), up to three automatic copies of your bookmark tree (taken before a
  run that deletes or moves bookmarks, kept 30 days), and your API key (if you use the
  OpenAI-compatible API backend) are kept in local storage only and are never synced anywhere. The key is **encrypted at
  rest** (AES-GCM). None of it is ever sent to the extension developer; we operate no server
  that stores it.
- **What we never do:** sell data, run analytics, or transmit your data to the developer.

Contact: hello@lusk.dev

Policy URL: https://lusk.dev/browser-organizer/privacy
