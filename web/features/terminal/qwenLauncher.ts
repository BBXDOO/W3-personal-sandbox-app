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
export const QWEN_SESSION_KEY = 'w3-terminal-qwen-session';
export interface QwenSession { id: string; cwd: string; exitCode: number | null; }

export async function qwenSession(existingId: string | null, cols: number, rows: number): Promise<{
  session: QwenSession; sessions: QwenSession[]; started: boolean;
}> {
  const { sessions } = await terminalRequest<{ sessions: QwenSession[] }>('GET', '/sessions');
  const previous = sessions.find(session => session.id === existingId);
  if (previous?.exitCode === null) return { session: previous, sessions, started: false };
  // A finished Qwen process has no work left to interrupt; release its slot.
  if (previous) {
    await terminalRequest('POST', `/sessions/${previous.id}/close`);
    sessions.splice(sessions.indexOf(previous), 1);
  }
  const session = await terminalRequest<QwenSession>('POST', '/sessions', { cwd: '~', cols: Math.max(2, cols), rows: Math.max(2, rows) });
  return { session, sessions: [...sessions, session], started: true };
}
