import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveCommand, resolveArgs, tmpBase, hostEnv } from '../config.js';

const MAX_STDOUT = 5 * 1024 * 1024; // 5 MB hard cap against runaway output

// Claude Code headless: pipe the prompt on stdin, read a JSON envelope on stdout.
// Running in a private temp cwd with tools disabled keeps it a pure text
// transform — it never touches the user's files. Command/args/cwd/env are
// resolved host-side only (see ../config.js); `opts` may only carry a bounded
// timeoutMs (and spawnFn for tests) — never an executable path, argv, or env.
export const claudeAdapter = {
  name: 'claude',
  async run(prompt, opts = {}) {
    const timeoutMs = opts.timeoutMs || 120000;
    const spawnFn = opts.spawnFn || spawn;      // tests inject spawnFn only
    const command = resolveCommand();           // host-side, never from message
    const args = resolveArgs();
    // Private per-run cwd so a shared /tmp/.claude cannot re-enable tools.
    const cwd = fs.mkdtempSync(path.join(tmpBase(), 'borg-'));

    try {
      return await new Promise((resolve, reject) => {
        let child;
        try {
          child = spawnFn(command, args, { cwd, env: hostEnv([]) });
        } catch (err) { reject(err); return; }

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

        child.stdout.on('data', (d) => {
          stdout += d;
          if (stdout.length > MAX_STDOUT) {
            finish(reject, new Error('CLI output exceeded size limit'));
            try { child.kill('SIGKILL'); } catch {}
          }
        });
        child.stderr.on('data', (d) => { stderr += d; });
        child.on('error', (err) => finish(reject, err));
        child.on('close', (code) => {
          if (code === 0) finish(resolve, extractResultText(stdout));
          else finish(reject, new Error(`CLI exited ${code}: ${stderr.trim()}`));
        });

        child.stdin.write(prompt);
        child.stdin.end();
      });
    } finally {
      try { fs.rmSync(cwd, { recursive: true, force: true }); } catch {}
    }
  },

  async health(opts = {}) {
    const spawnFn = opts.spawnFn || spawn;
    const command = resolveCommand();
    return await new Promise((resolve, reject) => {
      let out = '';
      let child;
      try { child = spawnFn(command, ['--version'], { env: hostEnv([]) }); }
      catch (err) { reject(err); return; }
      const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {}; reject(new Error('version check timed out')); }, 10000);
      child.stdout.on('data', (d) => { out += d; });
      child.on('error', (err) => { clearTimeout(timer); reject(err); });
      child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve({ version: out.trim() }) : reject(new Error(`version check exited ${code}`)); });
      if (child.stdin) child.stdin.end();
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
