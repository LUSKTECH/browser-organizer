#!/usr/bin/env node
import path from 'node:path';
import { createMessageReader, encodeMessage } from './messaging.js';
import { handle } from './dispatch.js';
import { chooseMode } from './entry.js';

function send(obj) { process.stdout.write(encodeMessage(obj)); }

// The native-messaging loop the browser talks to. Unchanged behaviour: read
// length-prefixed frames from stdin, dispatch, write length-prefixed replies.
function runMessaging() {
  const reader = createMessageReader();

  process.stdin.on('data', async (chunk) => {
    const messages = reader.push(chunk);
    for (const msg of messages) {
      if (msg && msg.frameError) { send({ id: null, ok: false, error: `Bad frame: ${msg.frameError}` }); continue; }
      try {
        const result = await handle(msg);
        send({ id: msg.id, ok: true, result });
      } catch (err) {
        send({ id: msg.id, ok: false, error: String((err && err.message) || err) });
      }
    }
  });

  process.stdin.on('end', () => process.exit(0));
}

// When the per-OS installer runs `browser-organizer-host --install`, register the
// host against this very executable. Detect SEA so the manifest points at the
// binary (process.execPath IS the binary) rather than at `node`.
async function runInstaller(mode, argv) {
  const { install, uninstall } = await import('./installer.js');
  let isSea = false;
  try { const sea = await import('node:sea'); isSea = sea.isSea(); } catch { /* not a SEA build */ }
  const rest = argv.filter((a) => !a.startsWith('--'));
  const browsers = (rest[0] || 'chrome,edge').split(',').filter(Boolean);
  // As a SEA binary, target the dir the binary lives in so install() finds the
  // binary there and points the manifest straight at it. Otherwise let install()
  // fall back to its default stable home (the source-copy path).
  const copyTo = isSea ? path.dirname(process.execPath) : undefined;
  const opts = copyTo ? { browsers, copyTo } : { browsers };
  if (mode === 'uninstall') {
    const removed = uninstall(opts);
    process.stdout.write((removed.length ? 'Removed:\n' + removed.map((f) => '  ' + f).join('\n') : 'Nothing to remove.') + '\n');
  } else {
    const written = install(opts);
    process.stdout.write('Installed Browser Organizer host:\n' + written.map((f) => '  ' + f).join('\n') + '\n');
  }
}

const { mode } = chooseMode(process.argv.slice(2));
if (mode === 'messaging') runMessaging();
else runInstaller(mode, process.argv.slice(2));
