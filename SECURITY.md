# Security Model — Browser Organizer

- **CLI command is host-controlled.** Each adapter (claude / antigravity / kiro)
  resolves its binary from its own environment override (`BROWSER_ORGANIZER_CLI`,
  `BROWSER_ORGANIZER_ANTIGRAVITY_CMD`, `BROWSER_ORGANIZER_KIRO_CMD`) or PATH, and
  uses fixed arguments. The host never accepts an executable path, arguments, or
  environment from an extension message — only a bounded `timeoutMs` and an
  adapter *name* that selects from a fixed registry. The message can pick *which*
  known CLI runs, never *what command* runs.
- **Spawn environment is a controlled allowlist.** Adapters run with only PATH,
  HOME, and a small set of declared auth vars (e.g. `GEMINI_API_KEY`,
  `KIRO_API_KEY`) passed through from the host's own environment — never from a
  message.
- **The HTTP (`openai`) adapter keeps the same invariant.** It resolves its
  bearer key, base URL, and model from host environment variables only
  (`BROWSER_ORGANIZER_OPENAI_API_KEY` / `_BASE_URL` / `_MODEL`) — never from a
  message, and the key is never stored in or reachable by the extension. The
  message can still only select the adapter *name* and a bounded `timeoutMs`.
  The request is issued by the native host, so no key or endpoint is exposed to
  the browser and the extension needs no host permissions for it.
- **Native host is a local executable.** Any local process can, in principle, speak
  the native-messaging protocol to `run.sh`. The host can only run one of the fixed
  registered CLIs with fixed arguments over a private temp dir. Keep `run.sh`
  permissions at 0700.
- **Agentic CLIs run tool-restricted.** Several backends are agentic (can run shell
  commands / edit files), so a prompt-injected tab title could otherwise escalate
  from "bad grouping" to real actions. Each is pinned to a tool-restricted mode:
  - **claude** — `--allowedTools ''` (tools fully disabled) — strongest.
  - **ollama** — local LLM, no tools — strongest.
  - **antigravity** — `--sandbox`, no `--dangerously-skip-permissions` (tools not auto-approved).
  - **kiro** — `--trust-tools=` (trusts no tools).
  - **codex** — `--sandbox read-only` (no writes/network; local reads still possible).
  - **copilot** — LOWER ASSURANCE: runs with its default tool policy; lock down via
    `BROWSER_ORGANIZER_COPILOT_ARGS`.

  Flags are host-controlled and overridable per adapter via
  `BROWSER_ORGANIZER_<NAME>_ARGS` (never from a message). For the strongest
  guarantee use **claude** or **ollama**. Flag defaults are best-effort per the
  CLIs' current docs; verify against your installed version.
- **Untrusted input.** Tab titles/URLs are treated as data, not instructions, in
  prompts, and model-returned tab ids are constrained to the exact candidates sent.
- **Data sent to the AI provider.** Tab titles and URLs (query strings/fragments
  stripped) are sent to your CLI's provider under your subscription. Bookmarks and
  history are processed locally and are not sent.
