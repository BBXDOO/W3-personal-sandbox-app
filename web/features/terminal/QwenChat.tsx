import React, { useEffect, useRef, useState } from 'react';
import { CHAT_KEY, ChatMessage, chatHistory, cleanReply, restoreChat, streamChat } from './qwenChatClient';
import { terminalBridge } from './terminalClient';

export default function QwenChat({ open, onClose }: { open: boolean; onClose(): void }) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => { try { return restoreChat(window.localStorage?.getItem(CHAT_KEY) || null); } catch { return []; } });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState<{ text: string; base: ChatMessage[] } | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  useEffect(() => () => cancel.current?.(), []);
  useEffect(() => { try { window.localStorage?.setItem(CHAT_KEY, JSON.stringify(messages.slice(-40))); } catch { /* Chat still works without storage. */ } }, [messages]);
  useEffect(() => {
    if (open && nearBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages, open, busy, error]);

  const send = (text: string, base = messages) => {
    if (busy || !text.trim()) return;
    const assistantId = crypto.randomUUID();
    const pair: ChatMessage[] = [{ id: crypto.randomUUID(), role: 'user', content: text.trim(), complete: true }, { id: assistantId, role: 'assistant', content: '', complete: false }];
    setMessages([...base, ...pair].slice(-40));
    setDraft(''); setBusy(true); setError(''); setNotice(''); setRetry(null); nearBottom.current = true;
    let raw = '';
    const fail = (message: string) => { setBusy(false); setError(message); setRetry({ text, base }); cancel.current = null; };
    try {
      cancel.current = streamChat(chatHistory(base, text.trim()), (type, value) => {
        if (type === 'delta') {
          raw += value;
          setMessages(current => current.map(item => item.id === assistantId ? { ...item, content: cleanReply(raw) } : item));
        } else if (type === 'done') {
          cancel.current = null;
          if (!cleanReply(raw)) { fail('Qwen3 ยังไม่ได้ส่งคำตอบ กรุณาลองอีกครั้ง'); return; }
          setMessages(current => current.map(item => item.id === assistantId ? { ...item, content: cleanReply(raw), complete: true } : item));
          setBusy(false);
        } else if (type === 'error') fail(value);
        else if (type === 'context' || type === 'limit') setNotice(value);
      });
    } catch (failure) { fail(failure instanceof Error ? failure.message : String(failure)); }
  };
  const stop = () => { cancel.current?.(); cancel.current = null; setBusy(false); setNotice('หยุดตอบแล้ว'); };
  return <section className="qwen-chat" aria-label="คุยภาษาไทยกับ Qwen3" hidden={!open}>
    <header className="terminal-toolbar qwen-chat-header">
      <button onClick={onClose}>‹ Terminal</button><strong>คุยกับ Qwen3</strong>
      <button disabled={busy || !messages.length} onClick={() => { setMessages([]); setError(''); setNotice(''); setRetry(null); }}>เริ่มคุยใหม่</button>
    </header>
    <div className="qwen-chat-messages" ref={scroll} role="log" aria-label="ประวัติสนทนา" aria-live="off"
      onScroll={() => { const view = scroll.current!; nearBottom.current = view.scrollHeight - view.scrollTop - view.clientHeight < 80; }}>
      {!messages.length && <p className="qwen-chat-empty">สวัสดีครับ คุยภาษาไทยได้เลย<br />พิมพ์เรื่องที่อยากคุยด้านล่าง</p>}
      {messages.map(item => <article key={item.id} className={`qwen-chat-message qwen-chat-${item.role}`}>
        <strong>{item.role === 'user' ? 'คุณ' : 'Qwen3'}</strong>
        <div>{item.content || (busy && item.id === messages[messages.length - 1]?.id ? 'กำลังตอบ…' : 'ยังไม่มีคำตอบ')}</div>
        {item.role === 'assistant' && !item.complete && item.content && !busy && <small>คำตอบยังไม่จบ</small>}
      </article>)}
    </div>
    <div className="qwen-chat-status" role="status">{busy ? 'กำลังตอบ…' : error || notice || 'ตอบภาษาไทย · ใช้บริบทช่วงล่าสุด'}</div>
    {error && retry && <div className="terminal-toolbar"><button onClick={() => send(retry.text, retry.base)}>ลองอีกครั้ง</button></div>}
    <form className="qwen-chat-compose" onSubmit={event => { event.preventDefault(); send(draft); }}>
      <textarea aria-label="ข้อความถึง Qwen3" placeholder="พิมพ์ข้อความภาษาไทย…" value={draft} onChange={event => setDraft(event.target.value)}
        maxLength={3000} rows={2} autoCorrect="off" />
      {busy ? <button type="button" onClick={stop}>หยุดตอบ</button>
        : <button disabled={!draft.trim() || !terminalBridge()?.qwenChat}>ส่ง</button>}
    </form>
  </section>;
}
