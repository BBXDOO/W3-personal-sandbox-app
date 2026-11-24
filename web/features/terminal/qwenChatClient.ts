import { terminalBridge } from './terminalClient';
export interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; complete: boolean; }
export const CHAT_KEY = 'w3-qwen-thai-chat-v1';
export const THAI_SYSTEM = 'คุณเป็นผู้ช่วยที่คุยภาษาไทยอย่างเป็นธรรมชาติ ตอบตรงคำถาม กระชับ และใช้บริบทที่ได้รับ ถ้าไม่รู้ให้บอกว่าไม่รู้ ถ้าคำถามกำกวมให้ถามสั้นๆ อย่าแต่งข้อมูล และอย่าอ้างว่าคุณอ่านไฟล์หรือรันคำสั่งได้';
export const cleanReply = (text: string) => text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').replace(/<\/?think>/gi, '').trim();

export function chatHistory(messages: ChatMessage[], text: string) {
  const pairs: { role: string; content: string }[][] = [];
  for (let index = 0; index + 1 < messages.length; index += 2) {
    const user = messages[index], assistant = messages[index + 1];
    if (user.role === 'user' && assistant.role === 'assistant' && assistant.complete && assistant.content.trim())
      pairs.push([{ role: 'user', content: user.content }, { role: 'assistant', content: assistant.content }]);
  }
  const recent = pairs.slice(-10);
  let length = THAI_SYSTEM.length + text.length + recent.flat().reduce((sum, item) => sum + item.content.length, 0);
  while (length > 12000 && recent.length) { length -= recent.shift()!.reduce((sum, item) => sum + item.content.length, 0); }
  return [{ role: 'system', content: THAI_SYSTEM }, ...recent.flat(), { role: 'user', content: text }];
}

export function streamChat(messages: ReturnType<typeof chatHistory>, onEvent: (type: string, text: string) => void): () => void {
  const bridge = terminalBridge();
  if (!bridge?.qwenChat) throw new Error('ต้องใช้แอป Android รุ่นที่รองรับแชต Qwen3');
  const id = crypto.randomUUID();
  let ended = false;
  const cleanup = () => { ended = true; window.removeEventListener('w3-qwen-chat', receive); clearTimeout(timer); };
  const receive = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (ended || detail.id !== id) return;
    if (detail.type === 'done' || detail.type === 'error') cleanup();
    onEvent(detail.type, detail.text || '');
  };
  const timer = window.setTimeout(() => {
    cleanup(); bridge.qwenCancel?.(id); onEvent('error', 'ใช้เวลาตอบนานเกินไป กรุณาลองใหม่');
  }, 300000);
  window.addEventListener('w3-qwen-chat', receive);
  try { bridge.qwenChat(id, JSON.stringify({ messages })); }
  catch (error) { cleanup(); throw error; }
  return () => { if (!ended) { cleanup(); bridge.qwenCancel?.(id); } };
}

export function restoreChat(value: string | null): ChatMessage[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) return [];
    const clean = parsed.filter((item): item is ChatMessage => item && typeof item.id === 'string' && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string' && item.content.length <= 8000 && typeof item.complete === 'boolean');
    // Keep only intact user/assistant pairs. An interrupted answer remains visible
    // but is not sent back as a complete assistant response.
    const pairs: ChatMessage[] = [];
    for (let i = 0; i + 1 < clean.length; i += 2) if (clean[i].role === 'user' && clean[i + 1].role === 'assistant') pairs.push(clean[i], clean[i + 1]);
    return pairs.slice(-40);
  } catch { return []; }
}
