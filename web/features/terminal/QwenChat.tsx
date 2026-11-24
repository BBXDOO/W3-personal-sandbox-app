import React, { useEffect, useRef, useState } from 'react';
import { CHAT_KEY, ChatMessage, ChatSource, chatHistory, cleanReply, memoryText, proposedMemory, restoreChat, streamChat } from './qwenChatClient';
import type { StoryPack } from '../../types';
import { exportTextDocument } from '../../core/documentFiles';
import { terminalBridge, terminalRequest } from './terminalClient';

export default function QwenChat({ open, onClose, story, fileContext, onRemoveFile, repository, onReadFile }: {
  open: boolean; onClose(): void; story?: StoryPack;
  fileContext?: ChatSource | null; onRemoveFile?(): void;
  repository?: { session: string; root: string };
  onReadFile?(source: ChatSource): void;
}) {
  const chatKey = story ? `${CHAT_KEY}.${story.storyId}` : CHAT_KEY;
  const memoryKey = `${chatKey}.memory`;
  const [memory, setMemory] = useState(() => {
    try { return memoryText(window.localStorage.getItem(memoryKey)); } catch { return ''; }
  });
  const [contextOpen, setContextOpen] = useState(false);
  const [projectSource, setProjectSource] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [startLine, setStartLine] = useState(1);
  const [readingFile, setReadingFile] = useState(false);
  const readGeneration = useRef(0);
  const repoSession = repository?.session;
  const repoRoot = repository?.root;
  useEffect(() => {
    setReadingFile(false);
    return () => { readGeneration.current++; };
  }, [repoSession, repoRoot, open]);

  const readPath = async () => {
    if (!repository || !onReadFile || readingFile || !repoPath.trim()) return;
    const generation = ++readGeneration.current;
    setReadingFile(true);
    setNotice('');
    try {
      const file = await terminalRequest<{ path: string; content: string }>(
        'POST', `/sessions/${repository.session}/read`, { root: repository.root, path: repoPath.trim() },
      );
      if (generation !== readGeneration.current) return;
      const lines = file.content.split('\n');
      if (!Number.isSafeInteger(startLine) || startLine < 1 || startLine > lines.length) {
        setNotice(`ไฟล์นี้มี ${lines.length} บรรทัด กรุณาเลือกบรรทัดเริ่มต้นใหม่`);
        return;
      }
      const excerpt = lines.slice(startLine - 1).join('\n');
      onReadFile({ title: `${file.path} (เริ่มบรรทัด ${startLine})`, text: excerpt });
      setError('');
    } catch (failure) {
      if (generation === readGeneration.current) {
        setNotice(`เปิดไฟล์ไม่สำเร็จ: ${failure instanceof Error ? failure.message : String(failure)}`);
      }
    } finally {
      if (generation === readGeneration.current) setReadingFile(false);
    }
  };
  const chapter = story?.storyNodes.find(node => node.nodeId === projectSource);
  const source = fileContext || (chapter
    ? { title: chapter.title || 'ตอนในโครงการ', text: chapter.body || '' }
    : projectSource === 'overview' && story ? { title: story.title, text: story.description || '' } : null);
  const serializeMemory = (note: string) => JSON.stringify({ version: 1, projectId: story?.storyId, note }, null, 2);
  const saveMemory = (note: string) => {
    try {
      window.localStorage.setItem(memoryKey, serializeMemory(note));
      setMemory(note);
      setNotice(note ? 'บันทึกความจำแล้ว' : 'ล้างความจำแล้ว');
    } catch { setNotice('บันทึกความจำไม่สำเร็จ'); }
  };
  const [messages, setMessages] = useState<ChatMessage[]>(() => { try { return restoreChat(window.localStorage?.getItem(chatKey) || null); } catch { return []; } });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState<{ text: string; base: ChatMessage[] } | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  useEffect(() => () => cancel.current?.(), []);
  useEffect(() => { try { window.localStorage?.setItem(chatKey, JSON.stringify(messages)); } catch { /* Chat still works without storage. */ } }, [chatKey, messages]);
  useEffect(() => {
    if (open && nearBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages, open, busy, error]);

  const send = (text: string, base = messages) => {
    if (busy || !text.trim()) return;
    const assistantId = crypto.randomUUID();
    const pair: ChatMessage[] = [{ id: crypto.randomUUID(), role: 'user', content: text.trim(), complete: true }, { id: assistantId, role: 'assistant', content: '', complete: false }];
    setMessages([...base, ...pair]);
    setDraft(''); setBusy(true); setError(''); setNotice(''); setRetry(null); nearBottom.current = true;
    let raw = '';
    const fail = (message: string) => { setBusy(false); setError(message); setRetry({ text, base }); cancel.current = null; };
    try {
      cancel.current = streamChat(chatHistory(base, text.trim(), source, memory), (type, value) => {
        if (type === 'delta') {
          raw += value;
          setMessages(current => current.map(item => item.id === assistantId ? { ...item, content: cleanReply(raw) } : item));
        } else if (type === 'done') {
          cancel.current = null;
          if (!cleanReply(raw)) { fail('Qwen3 ยังไม่ได้ส่งคำตอบ กรุณาลองอีกครั้ง'); return; }
          setMessages(current => current.map(item => item.id === assistantId ? { ...item, content: cleanReply(raw), complete: true } : item));
          const note = proposedMemory(raw);
          if (note && note !== memory) saveMemory(note);
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
      <button type="button" disabled={busy || !messages.length} onClick={() => {
        exportTextDocument(`qwen-chat-${new Date().toISOString().replaceAll(':', '-')}`, JSON.stringify({
          version: 1, projectId: story?.storyId, projectTitle: story?.title,
          exportedAt: new Date().toISOString(), messages,
        }, null, 2), 'json');
      }}>ส่งออกแชต</button>
      <button type="button" disabled={busy || (!messages.length && !draft && !source)} onClick={() => {
        setMessages([]); setDraft(''); setError(''); setNotice(''); setRetry(null);
        readGeneration.current++; setReadingFile(false); setRepoPath(''); setStartLine(1);
        setProjectSource(''); setContextOpen(false); onRemoveFile?.();
      }}>เริ่มคุยใหม่</button>
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
    <div className="terminal-toolbar">
      <button type="button" aria-expanded={contextOpen} onClick={() => setContextOpen(value => !value)}>+ บริบท</button>
      {source && <span title={source.title}>อ้างอิง: {source.title.slice(0, 32)}{source.text.length > 700 ? ' (สูงสุด 700 ตัวอักษร)' : ''}</span>}
      {fileContext && <button type="button" onClick={onRemoveFile}>เอาไฟล์ออก</button>}
    </div>
    {contextOpen && <div className="qwen-chat-context">
      {repository && <form className="qwen-chat-context" onSubmit={event => { event.preventDefault(); void readPath(); }}>
        <label>พาธในรีโป้ <small title={repository.root}>{repository.root}</small>
          <input value={repoPath} onChange={event => setRepoPath(event.target.value)}
            placeholder="repo_events/W3_STATUS_2026-10-31_TH.md" maxLength={4096} autoCapitalize="none" spellCheck={false} />
        </label>
        <div className="terminal-toolbar">
          <label>เริ่มที่บรรทัด <input type="number" min={1} value={startLine || ''} onChange={event => setStartLine(Number(event.target.value))} /></label>
          <button disabled={busy || readingFile || !repoPath.trim()}>{readingFile ? 'กำลังอ่าน…' : 'อ่านไฟล์'}</button>
        </div>
      </form>}
      {story && <label>เนื้อหาโครงการ <select value={projectSource} onChange={event => {
        setProjectSource(event.target.value);
        readGeneration.current++; setReadingFile(false);
        onRemoveFile?.();
      }}>
        <option value="">ไม่ใช้เนื้อหาโครงการ</option>
        <option value="overview">ชื่อและคำอธิบาย</option>
        {story.storyNodes.map(node => <option key={node.nodeId} value={node.nodeId}>{node.title || 'ตอนในโครงการ'}</option>)}
      </select></label>}
      <div>ความจำของ Qwen3</div>
      <div className="qwen-chat-status">{memory || 'ยังไม่มีบันทึก'}</div>
      <div className="terminal-toolbar">
        <button type="button" disabled={busy || !memory} onClick={() => saveMemory('')}>ล้างความจำ</button>
        <button type="button" disabled={!memory} onClick={() => exportTextDocument('qwen-memory', serializeMemory(memory), 'json')}>ส่งออก JSON</button>
      </div>
    </div>}
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
