export interface TerminalBridge {
  qwenChat?(id: string, body: string): void;
  qwenCancel?(id: string): void;
  terminalStatus(): string;
  prepareTerminal(): void;
  openTermux(): void;
  openOpenCodeChat?(): void;
  copyTerminalSetup(): void;
  copyTerminalText?(text: string): void;
  terminalRequest(id: string, method: string, path: string, body: string): void;
}

export const terminalBridge = () => (window as Window & { AndroidBridge?: TerminalBridge }).AndroidBridge;

export function terminalRequest<T>(method: 'GET' | 'POST', path: string, body = {}): Promise<T> {
  const bridge = terminalBridge();
  if (!bridge?.terminalRequest) return Promise.reject(new Error('Terminal ใช้งานผ่านแอป Android รุ่นที่รองรับ'));
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener('w3-terminal-response', receive);
      clearTimeout(timer);
    };
    const receive = (event: Event) => {
      const result = (event as CustomEvent).detail;
      if (result.id !== id) return;
      cleanup();
      if (result.ok) resolve(result.body);
      else reject(new Error(result.error || 'ติดต่อ Terminal ไม่สำเร็จ'));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Terminal ไม่ตอบกลับ โปรดตรวจว่า Termux ยังทำงานอยู่'));
    }, 10000);
    window.addEventListener('w3-terminal-response', receive);
    try { bridge.terminalRequest(id, method, path, JSON.stringify(body)); }
    catch (error) { cleanup(); reject(error); }
  });
}
