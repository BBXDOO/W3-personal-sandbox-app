import React, { useEffect, useRef, useState } from 'react';
import type { ChatSource } from './qwenChatClient';
import { terminalRequest } from './terminalClient';

interface Entry { name: string; kind: 'folder' | 'file'; readable: boolean; }
interface Listing { root: string; path: string; entries: Entry[]; nextOffset: number | null; }
interface Document { root: string; path: string; content: string; size: number; }
interface FolderProps { session: string; root: string; path: string; active: string; refresh: number; onFile(path: string): void; }
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

function Folder({ session, root, path, active, refresh, onFile }: FolderProps) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const load = async (offset = 0) => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const result = await terminalRequest<Listing>('POST', `/sessions/${session}/files`, { root, path, offset });
      if (current !== generation.current) return;
      setListing(previous => offset && previous ? { ...result, entries: [...previous.entries, ...result.entries] } : result);
      setError('');
    } catch (failure) { if (current === generation.current) setError(errorText(failure)); }
    finally { if (current === generation.current) setLoading(false); }
  };
  useEffect(() => { void load(); return () => { generation.current++; }; }, [session, root, path, refresh]);
  return <ul className="repository-tree" aria-label={path || 'ไฟล์ในโฟลเดอร์'}>
    {listing?.entries.map(entry => {
      const child = path && path !== '.' ? `${path}/${entry.name}` : entry.name;
      const open = expanded.includes(child);
      return <li key={entry.name}>
        <button type="button" title={entry.name} disabled={!entry.readable}
          aria-current={active === child ? 'true' : undefined}
          aria-expanded={entry.kind === 'folder' ? open : undefined}
          onClick={() => entry.kind === 'folder'
            ? setExpanded(current => open ? current.filter(item => item !== child) : [...current, child])
            : onFile(child)}>
          <span aria-hidden="true">{entry.kind === 'folder' ? open ? '▾ 📂' : '▸ 📁' : '　▤'}</span> {entry.name}
        </button>
        {entry.kind === 'folder' && open && <Folder {...{ session, root, active, refresh, onFile }} path={child} />}
      </li>;
    })}
    {loading && <li className="repository-hint" role="status">กำลังโหลด…</li>}
    {!loading && listing?.entries.length === 0 && <li className="repository-hint">โฟลเดอร์ว่าง</li>}
    {error && <li className="repository-hint" role="status">{error} <button onClick={() => void load()}>ลองใหม่</button></li>}
    {listing?.nextOffset != null && <li><button disabled={loading} onClick={() => void load(listing.nextOffset!)}>โหลดเพิ่ม</button></li>}
  </ul>;
}

export default function RepositoryPane({ session, initialRoot, available, connected, explorerOpen, onToggle, onUpgrade, onChatFile, onRootChange }: {
  session: string; initialRoot: string; available: boolean; connected: boolean;
  explorerOpen: boolean; onToggle(): void; onUpgrade(): void; onChatFile(file: ChatSource): void; onRootChange?(root: string): void;
}) {
  const [root, setRoot] = useState(initialRoot);
  const [draftRoot, setDraftRoot] = useState(initialRoot);
  const [folderDialog, setFolderDialog] = useState(false);
  const [document, setDocument] = useState<Document | null>(null);
  const [active, setActive] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);

  const openFile = async (path: string) => {
    const current = ++generation.current;
    setLoading(true);
    setActive(path);
    setDocument(null);
    setError('');
    try {
      const result = await terminalRequest<Document>('POST', `/sessions/${session}/read`, { root, path });
      if (current === generation.current) setDocument(result);
    } catch (failure) { if (current === generation.current) setError(errorText(failure)); }
    finally { if (current === generation.current) setLoading(false); }
  };
  const chooseFolder = async () => {
    setChoosing(true);
    try {
      const result = await terminalRequest<Listing>('POST', `/sessions/${session}/files`, { root: draftRoot.trim() || '~' });
      generation.current++;
      setRoot(result.root);
      onRootChange?.(result.root);
      setDocument(null);
      setActive('');
      setError('');
      setLoading(false);
      setFolderDialog(false);
      setRefresh(current => current + 1);
    } catch (failure) { setError(errorText(failure)); }
    finally { setChoosing(false); }
  };
  const ready = connected && available && !!session;
  return <div className={`repository-panes${explorerOpen ? '' : ' repository-panes-collapsed'}`}>
    <aside className="repository-explorer" aria-label="Explorer รายการไฟล์รีโป้" hidden={!explorerOpen}>
      <div className="repository-heading"><strong>EXPLORER</strong><button onClick={onToggle} aria-label="พับรายการไฟล์">‹</button></div>
      <div className="repository-actions">
        <button disabled={!ready} onClick={() => { setDraftRoot(root); setFolderDialog(true); }}>เปิดโฟลเดอร์</button>
        <button disabled={!ready} onClick={() => { setRefresh(current => current + 1); if (active) void openFile(active); }} aria-label="รีเฟรชไฟล์">↻</button>
      </div>
      <div className="repository-root" title={root}>{root.split('/').filter(Boolean).pop() || root}</div>
      <div className="repository-files">
        {ready ? <Folder session={session} root={root} path="" active={active} refresh={refresh} onFile={openFile} />
          : <p className="repository-hint">{connected && !available ? 'บริการเดิมยังไม่มี Explorer' : 'เชื่อมต่อเพื่อดูไฟล์'}</p>}
        {connected && !available && <button onClick={onUpgrade}>อัปเดตบริการ</button>}
      </div>
    </aside>
    <section className="repository-editor" aria-label="พื้นที่เปิดดูไฟล์">
      <header className="repository-heading">
        {!explorerOpen && <button onClick={onToggle} aria-label="เปิดรายการไฟล์">☰ ไฟล์</button>}
        <span title={active}>{active || 'ไฟล์'}</span>
        {document && <small>อ่านอย่างเดียว</small>}
      </header>
      <div className="repository-document">
        {loading ? <p className="repository-hint" role="status">กำลังเปิดไฟล์…</p>
          : error ? <p className="repository-hint" role="status">{error}</p>
          : document ? <pre tabIndex={0} aria-label={`เนื้อหา ${document.path}`}><code>{document.content.split('\n').map((line, index) =>
            <span className="repository-code-line" key={index}><span className="repository-line-number" aria-hidden="true">{index + 1}</span><span>{line || '\u200b'}</span>{'\n'}</span>)}</code></pre>
          : <p className="repository-hint">เลือกไฟล์จาก Explorer เพื่อเปิดดู</p>}
      </div>
      {document && <footer className="repository-file-status">UTF-8 · {document.size.toLocaleString()} bytes <button type="button" onClick={() => onChatFile({ title: document.path, text: document.content.slice(0, 700) })}>ใช้ในแชต Qwen3</button></footer>}
    </section>
    {folderDialog && <div className="terminal-dialog-backdrop">
      <form className="terminal-dialog" role="dialog" aria-modal="true" aria-labelledby="repository-folder-title"
        onKeyDown={event => { if (event.key === 'Escape') setFolderDialog(false); }}
        onSubmit={event => { event.preventDefault(); if (!choosing) void chooseFolder(); }}>
        <h2 id="repository-folder-title">เปิดโฟลเดอร์ใน Termux</h2>
        <input aria-label="พาธโฟลเดอร์รีโป้" autoFocus value={draftRoot} onChange={event => setDraftRoot(event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        {error && <p role="status">{error}</p>}
        <div className="terminal-toolbar"><button type="button" onClick={() => setFolderDialog(false)}>ยกเลิก</button><button disabled={choosing}>เปิด</button></div>
      </form>
    </div>}
  </div>;
}
