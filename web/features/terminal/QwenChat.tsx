import React, { useEffect, useRef, useState } from 'react';
import { CHAT_KEY, ChatMessage, ChatSource, chatHistory, cleanReply, memoryText, proposedMemory, restoreChat, streamChat } from './qwenChatClient';
import { generateId } from '../../core/utils';
import type { StoryPack } from '../../types';
import { exportTextDocument } from '../../core/documentFiles';
import { terminalBridge, terminalRequest } from './terminalClient';

export default function QwenChat({ open, onClose, story, onStoryChange, fileContext, onRemoveFile, repository, onReadFile }: {
  open: boolean; onClose(): void; story?: StoryPack; onStoryChange?(story: StoryPack): void;
  fileContext?: ChatSource | null; onRemoveFile?(): void;
  repository?: { session: string; root: string };
  onReadFile?(source: ChatSource): void;
}) {
  const chatKey = story ? `${CHAT_KEY}.${story.storyId}` : CHAT_KEY;
  const memoryKey = `${chatKey}.memory`;
  const [memory, setMemory] = useState(() => {
    try { return memoryText(window.localStorage.getItem(memoryKey)); } catch { return ''; }
  });
  const [mode, setMode] = useState<'chat' | 'rules' | 'resize'>('chat');
  const [boardId, setBoardId] = useState('');
  const [proposal, setProposal] = useState<
    { type: 'rules'; body: string } | { type: 'resize'; boardId: string; width: number; height: number } | null
  >(null);
  const board = story?.boards.find(item => item.boardId === boardId);
  const applyProposal = () => {
    if (!story || !onStoryChange || !proposal) return;
    if (proposal.type === 'rules') {
      const content = proposal.body.trim();
      if (!content) return;
      const rule = {
        id: generateId('rule'), name: 'กฎบอร์ดจาก Qwen3',
        blocks: [{ title: 'กติกา', content }], modifiers: [],
      };
      onStoryChange({ ...story, rulesets: [...(story.rulesets || []), rule] });
      setNotice('เพิ่มชุดกฎในเมนูกฎแล้ว');
    } else {
      if (!story.boards.some(item => item.boardId === proposal.boardId)) return;
      onStoryChange({ ...story, boards: story.boards.map(item => item.boardId === proposal.boardId
        ? { ...item, width: proposal.width, height: proposal.height }
        : item) });
      setNotice('ปรับขนาดบอร์ดแล้ว');
    }
    setProposal(null);
  };
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
    if (busy || !text.trim() || proposal || (mode === 'resize' && !board)) return;
    const task = mode === 'rules'
      ? 'ร่างชุดกติกาบอร์ดตามโจทย์ เขียนกติกาที่นำไปเล่นได้เลย ระบุวิธีเล่นและผลของกฎ'
      : mode === 'resize' && board
        ? `บอร์ดที่เลือกมีขนาด ${board.width}x${board.height} เสนอความกว้างและความสูงตามโจทย์ ช่วง 1–50 ช่อง ตอบเป็น WIDTHxHEIGHT เพียงบรรทัดเดียว ถ้าโจทย์ไม่ชัดให้ถามกลับ`
        : '';
    const assistantId = crypto.randomUUID();
    const pair: ChatMessage[] = [{ id: crypto.randomUUID(), role: 'user', content: text.trim(), complete: true }, { id: assistantId, role: 'assistant', content: '', complete: false }];
    setMessages([...base, ...pair]);
    setDraft(''); setBusy(true); setError(''); setNotice(''); setRetry(null); nearBottom.current = true;
    let raw = '';
    let reachedLimit = false;
    const fail = (message: string) => { setBusy(false); setError(message); setRetry({ text, base }); cancel.current = null; };
    try {
      cancel.current = streamChat(chatHistory(base, text.trim(), source, memory, task), (type, value) => {
        if (type === 'delta') {
          raw += value;
          setMessages(current => current.map(item => item.id === assistantId ? { ...item, content: cleanReply(raw) } : item));
        } else if (type === 'done') {
          cancel.current = null;
          const answer = cleanReply(raw);
          if (!answer) { fail('Qwen3 ยังไม่ได้ส่งคำตอบ กรุณาลองอีกครั้ง'); return; }
          setBusy(false);
          if (reachedLimit) return;
          setMessages(current => current.map(item => item.id === assistantId ? { ...item, content: answer, complete: true } : item));
          if (mode === 'rules') setProposal({ type: 'rules', body: answer });
          if (mode === 'resize' && board) {
            const size = answer.match(/^(\d{1,2})\s*[x×]\s*(\d{1,2})$/i);
            const width = Number(size?.[1]), height = Number(size?.[2]);
            if (width >= 1 && width <= 50 && height >= 1 && height <= 50) {
              setProposal({ type: 'resize', boardId: board.boardId, width, height });
            }
          }
          const note = proposedMemory(raw);
          if (note && note !== memory) saveMemory(note);
        } else if (type === 'error') fail(value);
        else if (type === 'limit') {
          reachedLimit = true;
          setNotice(value);
        } else if (type === 'context') setNotice(value);
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
        setProposal(null); setMode('chat'); setBoardId('');
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
    {story && onStoryChange && <div className="terminal-toolbar">
      <select aria-label="งานที่ให้ Qwen3 ช่วย" value={mode} disabled={busy || !!proposal} onChange={event => {
        const next = event.target.value;
        if (next === 'chat' || next === 'rules' || next === 'resize') setMode(next);
      }}>
        <option value="chat">คุยและปรึกษา</option>
        <option value="rules">ร่างกฎบอร์ด</option>
        <option value="resize">เสนอขนาดบอร์ด</option>
      </select>
      {mode === 'resize' && <select aria-label="บอร์ดที่จะแก้" value={boardId} disabled={busy || !!proposal} onChange={event => setBoardId(event.target.value)}>
        <option value="">เลือกบอร์ด</option>
        {story.boards.map(item => <option key={item.boardId} value={item.boardId}>{item.title}</option>)}
      </select>}
    </div>}
    {proposal && <div className="qwen-chat-context">
      {proposal.type === 'rules'
        ? <textarea aria-label="ร่างกฎที่ตรวจแก้ได้" value={proposal.body} rows={3}
            onChange={event => setProposal({ type: 'rules', body: event.target.value })} />
        : <div>ขนาดใหม่สำหรับ {board?.title} คือ {proposal.width} × {proposal.height}</div>}
      <div className="terminal-toolbar">
        <button type="button" disabled={proposal.type === 'rules' && !proposal.body.trim()} onClick={applyProposal}>
          {proposal.type === 'rules' ? 'เพิ่มชุดกฎ' : 'ใช้ขนาดนี้'}
        </button>
        <button type="button" onClick={() => setProposal(null)}>ยกเลิก</button>
      </div>
    </div>}
    <div className="qwen-chat-status" role="status">{busy ? 'กำลังตอบ…' : error || notice || 'ตอบภาษาไทย · ใช้บริบทช่วงล่าสุด'}</div>
    {error && retry && <div className="terminal-toolbar"><button onClick={() => send(retry.text, retry.base)}>ลองอีกครั้ง</button></div>}
    <form className="qwen-chat-compose" onSubmit={event => { event.preventDefault(); send(draft); }}>
      <textarea aria-label="ข้อความถึง Qwen3" placeholder="พิมพ์ข้อความภาษาไทย…" value={draft} onChange={event => setDraft(event.target.value)}
        maxLength={3000} rows={2} autoCorrect="off" />
      {busy ? <button type="button" onClick={stop}>หยุดตอบ</button>
        : <button disabled={!draft.trim() || !terminalBridge()?.qwenChat || !!proposal || (mode === 'resize' && !board)}>ส่ง</button>}
    </form>
  </section>;
}
