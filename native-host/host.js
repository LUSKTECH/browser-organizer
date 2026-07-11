#!/usr/bin/env node
import { createMessageReader, encodeMessage } from './messaging.js';
import { handle } from './dispatch.js';

function send(obj) { process.stdout.write(encodeMessage(obj)); }

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
