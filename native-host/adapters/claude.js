import { spawn } from 'node:child_process';
import os from 'node:os';

// Claude Code headless: pipe the prompt on stdin, read a JSON envelope on stdout.
// Running in a temp cwd with tools disabled keeps it a pure text transform — it
// never touches the user's files.
export const claudeAdapter = {
  name: 'claude',
  async run(prompt, opts = {}) {
    const {
      command = 'claude',
      args = ['-p', '--output-format', 'json', '--allowedTools', ''],
      cwd = os.tmpdir(),
      env = process.env,
      timeoutMs = 120000,
      spawnFn = spawn,
    } = opts;

    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawnFn(command, args, { cwd, env });
      } catch (err) {
        reject(err);
        return;
      }
      let stdout = '';
      let stderr = '';
      let done = false;
      const finish = (fn, arg) => { if (!done) { done = true; clearTimeout(timer); fn(arg); } };
      const timer = setTimeout(() => {
        // Mark the promise settled before killing the child: killing the fake
        // (and some real) child processes emits 'close' synchronously, which
        // would otherwise resolve the promise instead of rejecting it.
        finish(reject, new Error(`CLI timed out after ${timeoutMs}ms`));
        try { child.kill('SIGKILL'); } catch {}
      }, timeoutMs);

      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('error', (err) => finish(reject, err));
      child.on('close', (code) => {
        if (code === 0 || code === null) finish(resolve, extractResultText(stdout));
        else finish(reject, new Error(`CLI exited ${code}: ${stderr.trim()}`));
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  },
};

export function extractResultText(stdout) {
  const trimmed = String(stdout).trim();
  try {
    const env = JSON.parse(trimmed);
    if (env && typeof env.result === 'string') return env.result;
  } catch {
    // not an envelope — fall through
  }
  return trimmed;
}
