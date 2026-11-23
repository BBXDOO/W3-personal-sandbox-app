import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { QWEN_COMMAND, qwenSession } from '../features/terminal/qwenLauncher';

// Run the exact command sent to the PTY with a fake model server. The real
// model/llama-server stay on the user's device; this checks bash quoting/argv.
const home = mkdtempSync(join(tmpdir(), 'w3-qwen home-'));
try {
  const bin = join(home, 'bin');
  const cache = join(home, '.cache/huggingface/hub/models--test/snapshots/snapshot');
  mkdirSync(bin);
  mkdirSync(cache, { recursive: true });
  const model = join(cache, 'Qwen3-1.7B-Q8_0.gguf');
  const args = join(home, 'argv');
  writeFileSync(join(bin, 'llama-server'), '#!/bin/sh\nprintf "%s\\0" "$@" > "$W3_QWEN_TEST_ARGS"\nexit 17\n', { mode: 0o755 });
  const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, W3_QWEN_TEST_ARGS: args };
  const missing = spawnSync('bash', ['-c', QWEN_COMMAND.slice(0, -1)], { env, encoding: 'utf8' });
  assert.equal(missing.status, 0);
  assert.ok(missing.stdout.includes('ไม่พบไฟล์โมเดลที่อ่านได้'));
  writeFileSync(model, 'fixture model');
  const started = spawnSync('bash', ['-c', QWEN_COMMAND.slice(0, -1)], { env, encoding: 'utf8' });
  assert.equal(started.status, 17, started.stderr);
  assert.deepEqual(readFileSync(args, 'utf8').split('\0').slice(0, -1), ['-m', model, '--host', '127.0.0.1', '--port', '8080', '-c', '2048']);
} finally { rmSync(home, { recursive: true, force: true }); }

// Exercise the launcher through the same asynchronous bridge events as Android.
const surface = new EventTarget() as EventTarget & Record<string, any>;
surface.setTimeout = setTimeout;
(globalThis as any).window = surface;
const calls: { method: string; path: string; body: any }[] = [];
let sessions = [{ id: 'qwen-old', cwd: '~', exitCode: null as number | null }, { id: 'work', cwd: '~/repo', exitCode: null as number | null }];
surface.AndroidBridge = { terminalRequest(id: string, method: string, path: string, bodyText: string) {
  const body = JSON.parse(bodyText);
  calls.push({ method, path, body });
  let result: unknown;
  if (method === 'GET' && path === '/sessions') result = { sessions: sessions.map(session => ({ ...session })) };
  else if (path.endsWith('/close')) result = { ok: true };
  else if (method === 'POST' && path === '/sessions') result = { id: 'qwen-new', cwd: '/home/user', exitCode: null };
  else throw new Error(`Unexpected request ${path}`);
  surface.dispatchEvent(new CustomEvent('w3-terminal-response', { detail: { id, ok: true, body: result } }));
} };
const reused = await qwenSession('qwen-old', 80, 24);
assert.equal(reused.started, false);
assert.equal(reused.session.id, 'qwen-old');
assert.equal(calls.length, 1, 'an active Qwen session must not receive another command');
calls.length = 0;
sessions[0].exitCode = 17;
const restarted = await qwenSession('qwen-old', 1, 1);
assert.equal(restarted.started, true);
assert.deepEqual(restarted.sessions.map(session => session.id), ['work', 'qwen-new']);
assert.deepEqual(calls.map(call => call.path), ['/sessions', '/sessions/qwen-old/close', '/sessions']);
assert.deepEqual(calls[2].body, { cwd: '~', cols: 2, rows: 2 });
console.log('Qwen launcher: bash execution, exact model/arguments, missing model, session reuse and finished-session restart passed');
