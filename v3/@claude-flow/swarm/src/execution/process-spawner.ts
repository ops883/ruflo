/**
 * Process Spawner
 * Low-level subprocess management for spawning Claude CLI instances.
 * Handles stdin/stdout, timeouts, SIGTERM/SIGKILL cascades, and process tracking.
 *
 * Fixes:
 * - #1395 Bug 1: Closes stdin immediately after writing prompt
 * - #1117: SIGTERM then SIGKILL on timeout (no orphan processes)
 */

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { SpawnOptions, ManagedProcess, ProcessResult, TokenUsage } from './types.js';

const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes
const KILL_GRACE_MS = 5_000; // 5 seconds between SIGTERM and SIGKILL

let processCounter = 0;

export class ProcessSpawner extends EventEmitter {
  private readonly trackedProcesses = new Map<string, ManagedProcess>();
  private readonly claudeExecutable: string;
  private isShuttingDown = false;

  constructor(claudeExecutable = 'claude') {
    super();
    this.claudeExecutable = claudeExecutable;
    this.setupShutdownHandlers();
  }

  /**
   * Spawn a Claude CLI subprocess in print mode.
   * Writes prompt to stdin, closes stdin, collects output, enforces timeout.
   */
  spawn(options: SpawnOptions): ManagedProcess {
    const id = `proc-${++processCounter}-${Date.now()}`;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const args = this.buildArgs(options);
    const env = {
      ...process.env,
      ...options.env,
    };

    const child = spawn(this.claudeExecutable, args, {
      cwd: options.cwd ?? process.cwd(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false,
    });

    if (!child.pid) {
      throw new Error(`Failed to spawn Claude process: ${this.claudeExecutable} ${args.join(' ')}`);
    }

    let stdout = '';
    let stderr = '';

    const managed: ManagedProcess = {
      id,
      process: child,
      pid: child.pid,
      status: 'spawning',
      startedAt: new Date(),
      stdout: '',
      stderr: '',
      completion: null as unknown as Promise<ProcessResult>,
    };

    // Create the completion promise
    managed.completion = new Promise<ProcessResult>((resolve) => {
      let resolved = false;
      let timedOut = false;

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        this.killProcess(managed, 'timeout');
      }, timeoutMs);

      child.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        managed.stdout = stdout;
        this.emit('output', { id, chunk, stream: 'stdout' });
      });

      child.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        managed.stderr = stderr;
        this.emit('output', { id, chunk, stream: 'stderr' });
      });

      child.on('close', (code, signal) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutHandle);

        managed.status = timedOut ? 'killed' : (code === 0 ? 'completed' : 'failed');
        managed.endedAt = new Date();
        managed.exitCode = code ?? -1;

        const durationMs = managed.endedAt.getTime() - managed.startedAt.getTime();
        const tokenUsage = this.parseTokenUsage(stdout);

        const result: ProcessResult = {
          success: code === 0 && !timedOut,
          output: stdout,
          error: stderr,
          exitCode: code ?? -1,
          durationMs,
          timedOut,
          tokenUsage,
        };

        this.trackedProcesses.delete(id);
        this.emit('exit', { id, result });
        resolve(result);
      });

      child.on('error', (err) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutHandle);

        managed.status = 'failed';
        managed.endedAt = new Date();

        const durationMs = managed.endedAt.getTime() - managed.startedAt.getTime();

        const result: ProcessResult = {
          success: false,
          output: stdout,
          error: err.message,
          exitCode: -1,
          durationMs,
          timedOut: false,
        };

        this.trackedProcesses.delete(id);
        this.emit('error', { id, error: err });
        resolve(result);
      });
    });

    // Track the process
    this.trackedProcesses.set(id, managed);

    // Write prompt to stdin and CLOSE IT IMMEDIATELY
    // This is the critical fix for #1395 Bug 1 — without closing stdin,
    // `claude --print` blocks forever waiting for more input.
    if (child.stdin) {
      child.stdin.write(options.prompt);
      child.stdin.end();
    }

    managed.status = 'running';
    this.emit('spawn', { id, pid: child.pid });

    return managed;
  }

  /**
   * Kill a managed process with SIGTERM -> SIGKILL cascade.
   * Fixes #1117: ensures no orphan processes.
   */
  async killProcess(managed: ManagedProcess, reason = 'manual'): Promise<void> {
    if (managed.status === 'completed' || managed.status === 'killed') return;

    this.emit('killing', { id: managed.id, reason });

    const child = managed.process;

    // First try SIGTERM for graceful shutdown
    try {
      child.kill('SIGTERM');
    } catch {
      // Process may already be dead
    }

    // Wait for graceful shutdown, then SIGKILL
    await new Promise<void>((resolve) => {
      const killTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // Already dead
        }
        resolve();
      }, KILL_GRACE_MS);

      child.once('close', () => {
        clearTimeout(killTimer);
        resolve();
      });
    });

    managed.status = 'killed';
    managed.endedAt = new Date();
    this.trackedProcesses.delete(managed.id);
  }

  /**
   * Kill all tracked processes. Called during shutdown.
   */
  async killAll(reason = 'shutdown'): Promise<void> {
    const processes = Array.from(this.trackedProcesses.values());
    await Promise.allSettled(
      processes.map((p) => this.killProcess(p, reason)),
    );
  }

  /** Get count of active processes */
  get activeCount(): number {
    return this.trackedProcesses.size;
  }

  /** Get metrics for all tracked processes */
  getMetrics(): { active: number; ids: string[] } {
    return {
      active: this.trackedProcesses.size,
      ids: Array.from(this.trackedProcesses.keys()),
    };
  }

  private buildArgs(options: SpawnOptions): string[] {
    const args = ['--print'];

    if (options.model) {
      args.push('--model', options.model);
    }
    if (options.outputFormat) {
      args.push('--output-format', options.outputFormat);
    }
    if (options.maxBudgetUsd !== undefined) {
      args.push('--max-budget-usd', String(options.maxBudgetUsd));
    }
    if (options.allowedTools) {
      args.push('--allowedTools', options.allowedTools);
    }
    if (options.sessionId) {
      args.push('--session-id', options.sessionId);
    }
    if (options.systemPrompt) {
      args.push('--append-system-prompt', options.systemPrompt);
    }

    return args;
  }

  /**
   * Attempt to parse token usage from Claude's output.
   * Claude --print with --output-format json includes usage metadata.
   */
  private parseTokenUsage(output: string): TokenUsage | undefined {
    try {
      // Try to find JSON usage block in output
      const usageMatch = output.match(/"usage"\s*:\s*\{[^}]+\}/);
      if (usageMatch) {
        const parsed = JSON.parse(`{${usageMatch[0]}}`);
        if (parsed.usage) {
          return {
            inputTokens: parsed.usage.input_tokens ?? 0,
            outputTokens: parsed.usage.output_tokens ?? 0,
            totalTokens: (parsed.usage.input_tokens ?? 0) + (parsed.usage.output_tokens ?? 0),
          };
        }
      }
    } catch {
      // Not JSON output or no usage info
    }
    return undefined;
  }

  private setupShutdownHandlers(): void {
    const cleanup = () => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      // Synchronously kill all processes on exit
      for (const managed of this.trackedProcesses.values()) {
        try {
          managed.process.kill('SIGKILL');
        } catch {
          // Best effort
        }
      }
    };

    process.on('exit', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
  }
}
