import { Buffer } from 'node:buffer';

export function encodeMessage(obj) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  return Buffer.concat([header, json]);
}

// Stateful reader: feed it raw stdin chunks; it returns any complete messages,
// buffering partial ones until the rest arrives.
export function createMessageReader() {
  let buffer = Buffer.alloc(0);
  return {
    push(chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      const messages = [];
      while (buffer.length >= 4) {
        const len = buffer.readUInt32LE(0);
        if (buffer.length < 4 + len) break;
        const json = buffer.subarray(4, 4 + len).toString('utf8');
        buffer = buffer.subarray(4 + len);
        messages.push(JSON.parse(json));
      }
      return messages;
    },
  };
}
