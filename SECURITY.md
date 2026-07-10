# Security Model — Browser Organizer

- **CLI command is host-controlled.** The native host resolves the CLI binary from
  its own environment (`BROWSER_ORGANIZER_CLI`) or PATH. It never accepts an
  executable path, arguments, or environment from an extension message — only a
  bounded `timeoutMs`. This prevents a compromised extension page from running
  arbitrary commands.
- **Native host is a local executable.** Any local process can, in principle, speak
  the native-messaging protocol to `run.sh`. Because the host can only run the fixed
  CLI with fixed arguments over a private temp dir with tools disabled, the blast
  radius is limited to "ask the CLI a question." Keep `run.sh` permissions at 0700.
- **Untrusted input.** Tab titles/URLs are treated as data, not instructions, in
  prompts, and model-returned tab ids are constrained to the exact candidates sent.
- **Data sent to the AI provider.** Tab titles and URLs (query strings/fragments
  stripped) are sent to your CLI's provider under your subscription. Bookmarks and
  history are processed locally and are not sent.
