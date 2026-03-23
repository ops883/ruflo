/**
 * @claude-flow/ide - Ruflo LSP Server
 *
 * Wraps the TypeScript Language Server (tsserver / ts-language-server) to give
 * Ruflo agents live diagnostics, hover info, and a list of open files. Results
 * are also exposed as MCP resources so agents can query them without running
 * the LSP themselves.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Diagnostic {
  filePath: string;
  line: number;
  character: number;
  endLine?: number;
  endCharacter?: number;
  severity: 'error' | 'warning' | 'information' | 'hint';
  message: string;
  code?: string | number;
  source?: string;
}

export interface HoverInfo {
  contents: string;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export interface LSPRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: unknown;
}

export interface LSPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface LSPNotification {
  jsonrpc: '2.0';
  method: string;
  params: unknown;
}

export interface RufloLSPServerOptions {
  /** Working directory / workspace root for the LS */
  workspaceRoot?: string;
  /** Command to launch the language server (defaults to typescript-language-server) */
  command?: string;
  /** Args passed to the language server command */
  args?: string[];
  /** Request timeout in milliseconds */
  requestTimeoutMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

export class RufloLSPServer extends EventEmitter {
  private readonly options: Required<RufloLSPServerOptions>;
  private lsProcess: ChildProcess | null = null;
  private requestId = 1;
  private readonly pendingRequests = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private readonly openFiles = new Set<string>();
  private readonly diagnosticsCache = new Map<string, Diagnostic[]>();
  private buffer = '';
  private initialized = false;

  constructor(options: RufloLSPServerOptions = {}) {
    super();
    this.options = {
      workspaceRoot: options.workspaceRoot ?? process.cwd(),
      command: options.command ?? 'typescript-language-server',
      args: options.args ?? ['--stdio'],
      requestTimeoutMs: options.requestTimeoutMs ?? 10_000,
    };
  }

  /**
   * Spawns the language server process and performs the LSP handshake
   * (initialize → initialized notification).
   */
  async start(): Promise<void> {
    if (this.lsProcess) {
      return; // Already running
    }

    this.lsProcess = spawn(this.options.command, this.options.args, {
      cwd: this.options.workspaceRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.lsProcess.on('error', (err) => {
      this.emit('error', err);
    });

    this.lsProcess.on('close', (code) => {
      this.lsProcess = null;
      this.initialized = false;
      this.emit('stopped', code);
    });

    // Pipe stderr to our own error events
    this.lsProcess.stderr?.on('data', (chunk: Buffer) => {
      this.emit('lsStderr', chunk.toString());
    });

    // Set up line-delimited LSP message reading
    this.setupReader();

    // Perform LSP initialize handshake
    await this.initialize();
  }

  /**
   * Shuts down the language server gracefully.
   */
  async stop(): Promise<void> {
    if (!this.lsProcess) return;

    try {
      await this.sendRequest('shutdown', null);
      this.sendNotification('exit', null);
    } catch {
      // Force kill if graceful shutdown fails
    }

    this.lsProcess.kill();
    this.lsProcess = null;
    this.initialized = false;
  }

  /**
   * Returns live diagnostics for the given file. If the file has not been
   * opened with the LS yet, it is opened first.
   */
  async getDiagnostics(filePath: string): Promise<Diagnostic[]> {
    if (!this.initialized) {
      return this.diagnosticsCache.get(filePath) ?? [];
    }

    if (!this.openFiles.has(filePath)) {
      await this.openFile(filePath);
    }

    // Diagnostics arrive via publishDiagnostics notifications — return cached
    return this.diagnosticsCache.get(filePath) ?? [];
  }

  /**
   * Returns hover information for the symbol at the given position.
   */
  async getHoverInfo(filePath: string, line: number, char: number): Promise<string | null> {
    if (!this.initialized) return null;

    if (!this.openFiles.has(filePath)) {
      await this.openFile(filePath);
    }

    try {
      const result = await this.sendRequest('textDocument/hover', {
        textDocument: { uri: this.toFileUri(filePath) },
        position: { line, character: char },
      });

      if (!result) return null;
      const hover = result as HoverInfo;
      return typeof hover.contents === 'string'
        ? hover.contents
        : JSON.stringify(hover.contents);
    } catch {
      return null;
    }
  }

  /**
   * Returns the list of files currently open in the language server.
   */
  getOpenFiles(): string[] {
    return Array.from(this.openFiles);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async initialize(): Promise<void> {
    await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri: this.toFileUri(this.options.workspaceRoot),
      capabilities: {
        textDocument: {
          publishDiagnostics: { relatedInformation: true },
          hover: { contentFormat: ['plaintext'] },
        },
      },
    });

    this.sendNotification('initialized', {});
    this.initialized = true;
    this.emit('started');
  }

  private async openFile(filePath: string): Promise<void> {
    const { readFileSync } = await import('node:fs');
    let text = '';
    try {
      text = readFileSync(filePath, 'utf8');
    } catch {
      return;
    }

    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: this.toFileUri(filePath),
        languageId: this.detectLanguageId(filePath),
        version: 1,
        text,
      },
    });
    this.openFiles.add(filePath);
  }

  private setupReader(): void {
    const stdout = this.lsProcess?.stdout;
    if (!stdout) return;

    const rl = createInterface({ input: stdout });

    rl.on('line', (line) => {
      if (line.startsWith('Content-Length:')) return;
      if (line === '') return;
      this.buffer += line;
      try {
        const msg = JSON.parse(this.buffer) as LSPResponse | LSPNotification;
        this.buffer = '';
        this.handleMessage(msg);
      } catch {
        // Incomplete JSON — wait for more data
      }
    });
  }

  private handleMessage(msg: LSPResponse | LSPNotification): void {
    if ('id' in msg && msg.id != null) {
      const pending = this.pendingRequests.get(msg.id as number);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.id as number);
        if ('error' in msg && msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve((msg as LSPResponse).result);
        }
      }
      return;
    }

    // Notification
    const notif = msg as LSPNotification;
    if (notif.method === 'textDocument/publishDiagnostics') {
      this.handleDiagnosticsNotification(notif.params);
    }

    this.emit('notification', notif);
  }

  private handleDiagnosticsNotification(params: unknown): void {
    const { uri, diagnostics } = params as {
      uri: string;
      diagnostics: Array<{
        range: { start: { line: number; character: number }; end: { line: number; character: number } };
        severity?: number;
        message: string;
        code?: string | number;
        source?: string;
      }>;
    };

    const filePath = uri.replace(/^file:\/\//, '');
    const SEVERITY_MAP: Record<number, Diagnostic['severity']> = {
      1: 'error', 2: 'warning', 3: 'information', 4: 'hint',
    };

    const mapped: Diagnostic[] = (diagnostics ?? []).map((d) => ({
      filePath,
      line: d.range.start.line,
      character: d.range.start.character,
      endLine: d.range.end.line,
      endCharacter: d.range.end.character,
      severity: SEVERITY_MAP[d.severity ?? 1] ?? 'error',
      message: d.message,
      code: d.code,
      source: d.source,
    }));

    this.diagnosticsCache.set(filePath, mapped);
    this.emit('diagnostics', filePath, mapped);
  }

  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.lsProcess?.stdin) {
        reject(new Error('Language server not running'));
        return;
      }

      const id = this.requestId++;
      const req: LSPRequest = { jsonrpc: '2.0', id, method, params };
      const body = JSON.stringify(req);
      const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request timed out: ${method}`));
      }, this.options.requestTimeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.lsProcess.stdin.write(header + body);
    });
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.lsProcess?.stdin) return;
    const notif: LSPNotification = { jsonrpc: '2.0', method, params };
    const body = JSON.stringify(notif);
    const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
    this.lsProcess.stdin.write(header + body);
  }

  private toFileUri(path: string): string {
    return `file://${path.startsWith('/') ? path : `/${path}`}`;
  }

  private detectLanguageId(filePath: string): string {
    if (filePath.endsWith('.ts') || filePath.endsWith('.mts')) return 'typescript';
    if (filePath.endsWith('.tsx')) return 'typescriptreact';
    if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) return 'javascript';
    if (filePath.endsWith('.jsx')) return 'javascriptreact';
    return 'plaintext';
  }
}
