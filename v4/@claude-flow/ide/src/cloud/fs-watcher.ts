/**
 * @claude-flow/ide - File System Watcher
 *
 * Watches the workspace for file changes and emits typed events that Ruflo
 * agents can subscribe to. Uses chokidar for cross-platform watching.
 *
 * Events emitted:
 *   file:edited    — any .ts / .js file saved
 *   security:trigger — files matching auth / crypto / password patterns
 *   test:trigger   — test files (*.test.ts, *.spec.ts, etc.)
 *   error          — watcher error
 */

import { EventEmitter } from 'node:events';
import chokidar, { FSWatcher as ChokidarWatcher } from 'chokidar';
import { basename } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FileEditedEvent {
  path: string;
  type: 'change' | 'add' | 'unlink';
  timestamp: Date;
}

export interface SecurityTriggerEvent extends FileEditedEvent {
  reason: 'auth' | 'crypto' | 'password' | 'secret' | 'key';
}

export interface TestTriggerEvent extends FileEditedEvent {
  testFramework?: 'jest' | 'vitest' | 'mocha' | 'unknown';
}

export type FSWatcherEvent =
  | { type: 'file:edited'; payload: FileEditedEvent }
  | { type: 'security:trigger'; payload: SecurityTriggerEvent }
  | { type: 'test:trigger'; payload: TestTriggerEvent };

export interface FSWatcherOptions {
  /** Glob patterns to ignore */
  ignored?: string[];
  /** Whether to fire events for existing files on start */
  ignoreInitial?: boolean;
  /** Milliseconds to debounce rapid successive changes to the same file */
  debounceMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SECURITY_PATTERNS = /(?:auth|crypto|password|secret|token|key|credential|jwt|oauth|ssl|tls)/i;

const TEST_FILE_PATTERNS = /\.(test|spec)\.(ts|js|tsx|jsx)$|__tests__/;

const CODE_FILE_GLOBS = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mts', '**/*.mjs'];

const DEFAULT_IGNORED = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.claude/**',
  '**/*.d.ts',
];

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

export class FSWatcher extends EventEmitter {
  private watcher: ChokidarWatcher | null = null;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly options: Required<FSWatcherOptions>;
  private watching = false;

  constructor(options: FSWatcherOptions = {}) {
    super();
    this.options = {
      ignored: options.ignored ?? DEFAULT_IGNORED,
      ignoreInitial: options.ignoreInitial ?? true,
      debounceMs: options.debounceMs ?? 150,
    };
  }

  /**
   * Starts watching the given workspace root for file changes.
   * Calling start when already watching is a no-op.
   */
  start(workspaceRoot: string): void {
    if (this.watching) {
      return;
    }

    const patterns = CODE_FILE_GLOBS.map((g) => `${workspaceRoot}/${g}`);

    this.watcher = chokidar.watch(patterns, {
      ignored: this.options.ignored,
      ignoreInitial: this.options.ignoreInitial,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on('change', (path) => this.handleChange(path, 'change'));
    this.watcher.on('add', (path) => this.handleChange(path, 'add'));
    this.watcher.on('unlink', (path) => this.handleChange(path, 'unlink'));
    this.watcher.on('error', (err) => this.emit('error', err));

    this.watching = true;
    this.emit('started', workspaceRoot);
  }

  /**
   * Stops watching. Safe to call multiple times.
   */
  async stop(): Promise<void> {
    if (!this.watcher) {
      return;
    }

    // Cancel all pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    await this.watcher.close();
    this.watcher = null;
    this.watching = false;
    this.emit('stopped');
  }

  /**
   * Returns true if the watcher is currently active.
   */
  isWatching(): boolean {
    return this.watching;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private handleChange(filePath: string, changeType: FileEditedEvent['type']): void {
    // Debounce per file path
    const existing = this.debounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.processChange(filePath, changeType);
    }, this.options.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  private processChange(filePath: string, changeType: FileEditedEvent['type']): void {
    const timestamp = new Date();
    const fileName = basename(filePath);

    const baseEvent: FileEditedEvent = { path: filePath, type: changeType, timestamp };

    // Always emit the generic file:edited event
    this.emit('file:edited', baseEvent);

    // Security trigger
    if (SECURITY_PATTERNS.test(fileName) || SECURITY_PATTERNS.test(filePath)) {
      const reason = this.classifySecurityReason(filePath);
      const securityEvent: SecurityTriggerEvent = { ...baseEvent, reason };
      this.emit('security:trigger', securityEvent);
    }

    // Test trigger
    if (TEST_FILE_PATTERNS.test(fileName)) {
      const testEvent: TestTriggerEvent = {
        ...baseEvent,
        testFramework: this.detectTestFramework(filePath),
      };
      this.emit('test:trigger', testEvent);
    }
  }

  private classifySecurityReason(filePath: string): SecurityTriggerEvent['reason'] {
    const lower = filePath.toLowerCase();
    if (/password/.test(lower)) return 'password';
    if (/crypto/.test(lower)) return 'crypto';
    if (/auth/.test(lower)) return 'auth';
    if (/secret/.test(lower)) return 'secret';
    return 'key';
  }

  private detectTestFramework(filePath: string): TestTriggerEvent['testFramework'] {
    // Heuristic: look for framework imports in the file extension / directory
    if (filePath.includes('vitest') || filePath.includes('__vitest__')) return 'vitest';
    if (filePath.includes('jest') || filePath.includes('__jest__')) return 'jest';
    if (filePath.includes('mocha')) return 'mocha';
    return 'unknown';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton export
// ─────────────────────────────────────────────────────────────────────────────

export const fsWatcher = new FSWatcher();
