import { Buffer } from 'node:buffer';

export function encodeMessage(obj) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  return Buffer.concat([header, json]);
}

// Chrome disconnects the native-messaging port if the host sends a single
// message larger than 1 MiB, which would fail every pending request. Replies go
// through encodeReply so an oversized one becomes a small error frame instead.
export const MAX_REPLY_BYTES = 1024 * 1024;

export function encodeReply(obj) {
  const frame = encodeMessage(obj);
  if (frame.length - 4 <= MAX_REPLY_BYTES) return frame;
  const id = obj && typeof obj === 'object' ? obj.id : null;
  return encodeMessage({ id: id === undefined ? null : id, ok: false, error: `reply too large (${frame.length - 4} bytes; limit 1 MiB)` });
}

// Hard cap on a single frame's declared length. Chrome's own inbound (extension
// -> host) limit is 64 MiB — the 1 MB figure only applies to host -> extension
// messages. This is a deliberate, independent cap well under that 64 MiB ceiling;
// past it we stop trusting the buffer rather than allocating unboundedly.
const MAX_FRAME_BYTES = 16 * 1024 * 1024;

// Module-private marker so a legitimate user message can never be mistaken for a
// bad-frame sentinel, whatever fields it carries (including `frameError`).
const FRAME_ERROR = Symbol('frameError');
export function isFrameError(msg) {
  return !!msg && typeof msg === 'object' && msg[FRAME_ERROR] === true;
}
function frameError(text) {
  return { id: null, frameError: text, [FRAME_ERROR]: true };
}

// Stateful reader: feed it raw stdin chunks; it returns any complete messages,
// buffering partial ones until the rest arrives. A single malformed frame does
// NOT discard earlier valid frames from the same chunk — it yields a per-frame
// error sentinel (see isFrameError) so the caller can respond to just it.
export function createMessageReader() {
  // Chunks accumulate in an array and are concatenated once, when the declared
  // frame length is available — trickling a big frame in small chunks is O(n).
  let chunks = [];
  let total = 0;
  let need = null; // 4 + declared length of the frame being read
  return {
    push(chunk) {
      chunks.push(chunk);
      total += chunk.length;
      const messages = [];
      while (total >= 4) {
        if (need === null) {
          if (chunks[0].length < 4) chunks = [Buffer.concat(chunks)];
          const len = chunks[0].readUInt32LE(0);
          if (len > MAX_FRAME_BYTES) {
            chunks = []; total = 0; // framing is unrecoverable — drop the buffer
            messages.push(frameError(`frame length ${len} exceeds ${MAX_FRAME_BYTES}`));
            break;
          }
          need = 4 + len;
        }
        if (total < need) break;
        const buf = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
        const json = buf.subarray(4, need).toString('utf8');
        const rest = buf.subarray(need);
        chunks = rest.length ? [rest] : [];
        total = rest.length;
        need = null;
        try {
          messages.push(JSON.parse(json));
        } catch (err) {
          messages.push(frameError(`invalid JSON: ${err.message}`));
        }
      }
      return messages;
    },
  };
}
