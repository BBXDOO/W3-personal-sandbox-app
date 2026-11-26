import { terminalRequest } from './terminalClient';

export const QWEN_SCRIPT = `model=$(find "$HOME/.cache/huggingface/hub" -name 'Qwen3-1.7B-Q8_0.gguf' -print -quit)
if [ -r "$model" ]; then
  llama-server -m "$model" --host 127.0.0.1 --port 8080 -c 2048
else
  printf '%s\\n' 'ไม่พบไฟล์โมเดลที่อ่านได้'
fi`;

// Replace the login shell so its exit status reflects the model server's lifetime.
// Single-quote the script as one bash argument, including its embedded quotes.
export const QWEN_COMMAND = `exec bash -c '${QWEN_SCRIPT.replace(/'/g, "'\\''")}'\r`;
export const OPENCODE_COMMAND = 'exec proot-distro login debian -- bash -lc \'exec "$HOME/.opencode/bin/opencode"\'\r';
export const OPENCODE_SESSION_KEY = 'w3-terminal-opencode-session';
export const QWEN_SESSION_KEY = 'w3-terminal-qwen-session';
export interface ProgramSession { id: string; cwd: string; exitCode: number | null; }

export async function programSession(existingId: string | null, cols: number, rows: number): Promise<{
  session: ProgramSession; sessions: ProgramSession[]; started: boolean;
}> {
  const { sessions } = await terminalRequest<{ sessions: ProgramSession[] }>('GET', '/sessions');
  const previous = sessions.find(session => session.id === existingId);
  if (previous?.exitCode === null) return { session: previous, sessions, started: false };
  // A finished process has no work left to interrupt; release its slot.
  if (previous) {
    await terminalRequest('POST', `/sessions/${previous.id}/close`);
    sessions.splice(sessions.indexOf(previous), 1);
  }
  const session = await terminalRequest<ProgramSession>('POST', '/sessions', { cwd: '~', cols: Math.max(2, cols), rows: Math.max(2, rows) });
  return { session, sessions: [...sessions, session], started: true };
}
