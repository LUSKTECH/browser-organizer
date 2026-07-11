import { EventEmitter } from 'node:events';

// Returns a spawn-compatible fn. `behavior(prompt)` returns
// { stdout, stderr, code } describing what the fake child produces.
export function makeFakeSpawn(behavior) {
  return function fakeSpawn(command, args, options) {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    let stdin = '';
    const stdinEvents = new EventEmitter();
    child.stdin = { on: (...a) => stdinEvents.on(...a), emit: (...a) => stdinEvents.emit(...a), write(d) { stdin += d; }, end() {
      const { stdout = '', stderr = '', code = 0, delay = 0 } = behavior(stdin, command, args, options) || {};
      setTimeout(() => {
        if (stdout) child.stdout.emit('data', Buffer.from(stdout));
        if (stderr) child.stderr.emit('data', Buffer.from(stderr));
        child.emit('close', code);
      }, delay);
    } };
    child.kill = () => child.emit('close', null);
    return child;
  };
}
