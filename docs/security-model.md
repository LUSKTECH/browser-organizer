# Security Model — Browser Organizer

- **CLI command is host-controlled.** Each CLI adapter (claude, antigravity, kiro,
  copilot, codex, ollama) resolves its binary from its own environment override
  (`BROWSER_ORGANIZER_CLI` for claude, `BROWSER_ORGANIZER_<NAME>_CMD` for the rest) or
  PATH, and uses fixed arguments. From an extension message the host accepts only a bounded
  `timeoutMs` and an adapter *name* that selects from a fixed registry, never an
  executable path, arguments, or environment. The message can pick *which*
  known CLI runs, never *what command* runs.
- **Spawn environment is a controlled allowlist.** Adapters run with only PATH,
  HOME, and a small set of declared auth vars (e.g. `GEMINI_API_KEY`,
  `KIRO_API_KEY`) passed through from the host's own environment, never from a
  message.
- **The HTTP (`openai`) adapter has two credential paths, both constrained.**
  1. *Host env* (`BROWSER_ORGANIZER_OPENAI_API_KEY` / `_BASE_URL` / `_MODEL`): the key
     never enters the browser. Strongest.
  2. *UI-entered*: the user pastes the key in Settings; it is stored **encrypted at
     rest** (AES-GCM, non-extractable WebCrypto key in IndexedDB, ciphertext in
     `storage.local`, never `storage.sync`) and passed to the host per request.
  A message may carry ONLY `{apiKey, baseUrl, model}` for this adapter, validated by
  `sanitizeConfig` (strings only), never a command, args, cwd, or env for any CLI
  adapter. The host still enforces `https://` (loopback `http` allowed) before
  sending the key, and caps the response size. UI entry trades a little strength
  (the key lives encrypted in the browser and transits one message) for usability;
  env stays available for the strongest posture.
- **Native host is a local executable.** Any local process can, in principle, speak
  the native-messaging protocol to `run.sh`. The host can only run one of the fixed
  registered CLIs with fixed arguments over a private temp dir. Keep `run.sh`
  permissions at 0700. The host is installed into a per-user home
  (`~/.browser-organizer`, or `%LOCALAPPDATA%\BrowserOrganizer` on Windows) and the
  browser's host manifest points there (a stable, per-user, non-elevated location);
  the install path change carries none of the message-surface invariants above.
- **Agentic CLIs run tool-restricted.** Several backends are agentic (can run shell
  commands / edit files), so a prompt-injected tab title could otherwise escalate
  from "bad grouping" to real actions. Each is pinned to a tool-restricted mode:
  - **claude**: `--allowedTools ''` plus `--disallowedTools` naming the built-in tools (Read, Edit, Write, Glob, Grep, LS, Bash, WebFetch, WebSearch, NotebookEdit, Task, TodoWrite, MultiEdit). `--allowedTools ''` alone only pre-approves nothing, and `--setting-sources ''` drops the user's own deny rules, so the explicit deny list is what blocks the built-ins. MCP tools are off via `--strict-mcp-config` by default. Strongest.
  - **ollama**: local LLM, no tools. Strongest.
  - **antigravity**: `--sandbox`, no `--dangerously-skip-permissions` (tools not auto-approved).
  - **kiro**: `--trust-tools=` (trusts no tools).
  - **codex**: `--sandbox read-only` (no writes/network; local reads still possible).
  - **copilot**: LOWER ASSURANCE: runs with its default tool policy; lock down via
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
