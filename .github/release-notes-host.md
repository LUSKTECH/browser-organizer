## Unsigned installers

The installers attached to this release are **not code-signed** yet (no Windows Authenticode
signature, and the macOS `.pkg` is neither signed nor notarized). Expect a warning on first run:

- **Windows:** SmartScreen shows "Windows protected your PC" and an "Unknown publisher".
  Choose **More info → Run anyway**.
- **macOS:** Gatekeeper blocks the `.pkg`. Control-click it and choose **Open**, or allow it under
  **System Settings → Privacy & Security**.

Verify what you downloaded against `SHA256SUMS.txt` (attached below). If you would rather not
run an unsigned installer, install the helper from source with Node 20+ instead:
`npx @lusktech/browser-organizer-host`. It is the same code, published to npm.

