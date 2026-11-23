import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { terminalBridge, terminalRequest } from './terminalClient';

interface ShellSession { id: string; cwd: string; exitCode: number | null; }
interface Output { data: string; offset: number; truncated: boolean; exitCode: number | null; }

export default function TerminalWorkspace() {
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const sessionId = useRef('');
  const inputQueue = useRef(Promise.resolve());
  const [sessions, setSessions] = useState<ShellSession[]>([]);
  const [selected, setSelected] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [cwd, setCwd] = useState('');
  const [command, setCommand] = useState('');
  const [automatic, setAutomatic] = useState(true);
  const [sessionFormOpen, setSessionFormOpen] = useState(false);
  const bridge = terminalBridge();
  const report = (error: unknown) => setMessage(error instanceof Error ? error.message : String(error));

  const send = (data: string) => {
    const id = sessionId.current;
    if (!id) return;
    inputQueue.current = inputQueue.current
      .then(() => terminalRequest('POST', `/sessions/${id}/input`, { data }))
      .then(() => {}).catch(report);
  };

  useEffect(() => {
    const screen = new Terminal({ cursorBlink: true, fontSize: 13, fontFamily: 'monospace', scrollback: 5000,
      theme: { background: '#111714', foreground: '#e5f2e8', cursor: '#82d5b2' } });
    const fit = new FitAddon();
    screen.loadAddon(fit);
    screen.open(host.current!);
    terminal.current = screen;
    const data = screen.onData(send);
    const resize = () => {
      if (!host.current?.clientWidth || !host.current?.clientHeight) return;
      fit.fit();
      if (sessionId.current) terminalRequest('POST', `/sessions/${sessionId.current}/resize`, { cols: screen.cols, rows: screen.rows }).catch(report);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host.current!);
    resize();
    return () => { observer.disconnect(); data.dispose(); screen.dispose(); terminal.current = null; };
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      await terminalRequest('GET', '/health');
      const result = await terminalRequest<{ sessions: ShellSession[] }>('GET', '/sessions');
      setSessions(result.sessions);
      setSelected(current => result.sessions.some(s => s.id === current) ? current : result.sessions.find(s => s.exitCode === null)?.id || result.sessions[0]?.id || '');
      setConnected(true);
      setMessage(result.sessions.length ? '' : 'ยังไม่มี session');
    } catch (error) { setConnected(false); report(error); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    const setup = (event: Event) => {
      const result = (event as CustomEvent).detail;
      setMessage(result.message);
      if (result.ready) void connect();
    };
    window.addEventListener('w3-terminal-setup', setup);
    if (bridge?.terminalRequest) {
      try {
        const status = JSON.parse(bridge.terminalStatus());
        setAutomatic(status.supportsRunCommand !== false);
        if (status.installed) void connect();
        else setMessage('ไม่พบ Termux โปรดติดตั้งและเปิด Termux ก่อน');
      } catch (error) { report(error); }
    }
    return () => window.removeEventListener('w3-terminal-setup', setup);
  }, []);

  useEffect(() => {
    sessionId.current = connected ? selected : '';
    if (!connected || !selected) return;
    let cancelled = false;
    let timer: number;
    let offset = 0;
    terminal.current?.reset();
    const screen = terminal.current!;
    terminalRequest('POST', `/sessions/${selected}/resize`, { cols: screen.cols, rows: screen.rows }).catch(report);
    const poll = async () => {
      try {
        const result = await terminalRequest<Output>('GET', `/sessions/${selected}/output?offset=${offset}`);
        if (cancelled) return;
        if (result.truncated) screen.writeln('\r\n[แสดงประวัติที่ยังอยู่ในหน่วยความจำ]\r\n');
        screen.write(Uint8Array.from(atob(result.data), character => character.charCodeAt(0)));
        offset = result.offset;
        if (result.exitCode !== null && !result.data) {
          setMessage(`Shell จบการทำงาน · exit code ${result.exitCode}`);
          return;
        }
        timer = window.setTimeout(poll, result.data ? 50 : 400);
      } catch (error) {
        if (!cancelled) { setConnected(false); report(error); }
      }
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); sessionId.current = ''; };
  }, [selected, connected]);

  const createSession = async () => {
    setBusy(true);
    try {
      const screen = terminal.current!;
      const session = await terminalRequest<ShellSession>('POST', '/sessions', { cwd: cwd.trim() || '~', cols: screen.cols, rows: screen.rows });
      setSessions(current => [...current, session]);
      setSelected(session.id);
      setMessage('');
      setSessionFormOpen(false);
    } catch (error) { report(error); }
    finally { setBusy(false); }
  };

  const closeSession = async () => {
    if (!selected || !window.confirm('ปิด session นี้และหยุดโปรเซสที่กำลังทำงาน?')) return;
    setBusy(true);
    try {
      await terminalRequest('POST', `/sessions/${selected}/close`);
      const remaining = sessions.filter(session => session.id !== selected);
      setSessions(remaining);
      setSelected(remaining[0]?.id || '');
      terminal.current?.reset();
    } catch (error) { report(error); }
    finally { setBusy(false); }
  };

  return <section className="terminal-workspace" aria-label="Terminal W3">
    <div className="terminal-toolbar terminal-actions" aria-label="เครื่องมือ Terminal">
      <button disabled={!bridge?.terminalRequest || busy} onClick={connect}
        title={connected ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}>
        <span className={connected ? 'terminal-connected' : 'terminal-disconnected'} aria-hidden="true">●</span> เชื่อมต่อ
      </button>
      {connected && <><select aria-label="Session" value={selected} onChange={event => setSelected(event.target.value)}>
        <option value="">เลือก session</option>
        {sessions.map((session, index) => <option key={session.id} value={session.id}>{index + 1} · {session.cwd}</option>)}
      </select>
      <button disabled={!connected || busy} onClick={() => {
        setCwd(sessions.find(session => session.id === selected)?.cwd || '~');
        setSessionFormOpen(true);
      }}>＋ Session</button>
      <button disabled={!selected || busy} onClick={closeSession}>ปิด session</button></>}
      <button onClick={() => bridge?.openTermux ? bridge.openTermux() : setMessage('ปุ่มเปิด Termux ใช้งานในแอป Android')}>เปิด Termux</button>
      <button disabled={!bridge?.prepareTerminal || busy} onClick={() => {
        if (automatic) { setMessage('กำลังเตรียม session…'); bridge?.prepareTerminal(); }
        else bridge?.copyTerminalSetup();
      }}>{automatic ? 'เตรียม session' : 'คัดลอกและเปิด Termux'}</button>
      {automatic && bridge?.copyTerminalSetup && <button onClick={() => bridge.copyTerminalSetup()}>คัดลอกคำสั่ง</button>}
    </div>
    <div className="terminal-screen-shell">
      <div ref={host} className="terminal-screen" aria-label="หน้าจอ shell" />
      {message && <div className="terminal-notice" role="status">
        <span>{message}</span>
        <button type="button" aria-label="ปิดข้อความสถานะ" onClick={() => setMessage('')}>×</button>
      </div>}
    </div>
    <div className="terminal-toolbar terminal-keys">
      <button disabled={!selected || !connected} onClick={() => terminal.current?.focus()}>คีย์บอร์ด</button>
      {([['Ctrl+C', '\x03'], ['Tab', '\t'], ['Esc', '\x1b'], ['↑', '\x1b[A'], ['↓', '\x1b[B'], ['←', '\x1b[D'], ['→', '\x1b[C']] as const).map(([label, data]) =>
        <button key={label} disabled={!selected || !connected} onClick={() => send(data)}>{label}</button>)}
    </div>
    <form className="terminal-toolbar" onSubmit={event => { event.preventDefault(); if (command.trim()) { send(command + '\r'); setCommand(''); } }}>
      <input aria-label="คำสั่ง Terminal" placeholder="คำสั่ง" value={command} onChange={event => setCommand(event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={!selected || !connected} />
      <button disabled={!selected || !connected || !command.trim()}>รัน ↵</button>
    </form>
    {sessionFormOpen && <div className="terminal-dialog-backdrop">
      <form className="terminal-dialog" role="dialog" aria-modal="true" aria-labelledby="terminal-session-title"
        onKeyDown={event => { if (event.key === 'Escape') setSessionFormOpen(false); }}
        onSubmit={event => { event.preventDefault(); if (!busy) void createSession(); }}>
        <h2 id="terminal-session-title">สร้าง session</h2>
        <label htmlFor="terminal-cwd">โฟลเดอร์รีโป้</label>
        <input id="terminal-cwd" autoFocus value={cwd} onChange={event => setCwd(event.target.value)}
          autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        <div className="terminal-toolbar">
          <button type="button" onClick={() => setSessionFormOpen(false)}>ยกเลิก</button>
          <button type="submit" disabled={busy}>สร้าง session</button>
        </div>
      </form>
    </div>}
  </section>;
}
