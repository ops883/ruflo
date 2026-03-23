/**
 * WorkerEventBus - Reactive event-driven worker triggers
 *
 * Workers subscribe to domain events so they fire immediately on relevant
 * activity rather than waiting for their next scheduled interval.
 * Each worker retains its interval timer as a fallback: if no event
 * has triggered it within FALLBACK_IDLE_MS, the timer fires anyway.
 *
 * Emitted events:
 *   'file:edited'       — a source file was written/modified
 *   'task:completed'    — a task or agent trajectory finished
 *   'security:trigger'  — an explicit security scan was requested
 *   'test:trigger'      — a test-gap analysis was requested
 *   'session:end'       — the current session is ending
 */

import { EventEmitter } from 'events';

// ============================================================================
// Constants
// ============================================================================

/** If a worker hasn't been triggered by an event for this long it will fire
 *  on its own fallback timer regardless of the scheduled interval. */
export const FALLBACK_IDLE_MS = 10 * 60 * 1000; // 10 minutes

// ============================================================================
// Event payload types
// ============================================================================

export interface FileEditedPayload {
  /** Absolute path of the file that was edited */
  filePath: string;
  /** Type of operation performed */
  operation: 'create' | 'modify' | 'delete';
}

export interface TaskCompletedPayload {
  /** Task or trajectory identifier */
  taskId: string;
  /** Whether the task succeeded */
  success: boolean;
  /** Optional quality score (0–1) */
  quality?: number;
}

export interface SecurityTriggerPayload {
  /** Reason the security scan was requested */
  reason: string;
}

export interface TestTriggerPayload {
  /** Optional scope hint (file path or module name) */
  scope?: string;
}

export interface SessionEndPayload {
  /** Session identifier */
  sessionId: string;
}

/** Union of all event payloads keyed by event name */
export interface WorkerBusEvents {
  'file:edited': FileEditedPayload;
  'task:completed': TaskCompletedPayload;
  'security:trigger': SecurityTriggerPayload;
  'test:trigger': TestTriggerPayload;
  'session:end': SessionEndPayload;
}

// ============================================================================
// WorkerEventBus
// ============================================================================

/**
 * Reactive event bus that workers subscribe to.
 *
 * Usage:
 *   workerEventBus.emit('file:edited', { filePath: '/src/foo.ts', operation: 'modify' });
 *
 * Workers call `subscribeWorker` to register a callback that fires on the
 * relevant event(s). The bus tracks the last-fired time per worker so the
 * scheduled fallback timer knows whether to skip a run.
 */
export class WorkerEventBus extends EventEmitter {
  /** Timestamp of the last event-driven trigger per worker name */
  private lastTriggered: Map<string, number> = new Map();

  constructor() {
    super();
    // Increase max listeners: we have ~11 workers, each can subscribe to
    // multiple events.
    this.setMaxListeners(50);
  }

  /**
   * Subscribe a worker to one or more bus events.
   *
   * When any of the specified events fires, `handler` is called with the
   * event payload.  The bus records the trigger time so `shouldFallback`
   * can decide whether the interval timer needs to fire.
   *
   * @param workerName  - Name used for tracking (must match WorkerManager key)
   * @param events      - One or more event names to listen on
   * @param handler     - Callback invoked with the typed payload
   */
  subscribeWorker<K extends keyof WorkerBusEvents>(
    workerName: string,
    events: K[],
    handler: (payload: WorkerBusEvents[K]) => void
  ): void {
    for (const event of events) {
      this.on(event, (payload: WorkerBusEvents[K]) => {
        this.lastTriggered.set(workerName, Date.now());
        handler(payload);
      });
    }
  }

  /**
   * Emit a typed bus event.
   *
   * This is a thin typed wrapper around EventEmitter.emit so callers get
   * compile-time checking on the payload shape.
   */
  emitEvent<K extends keyof WorkerBusEvents>(
    event: K,
    payload: WorkerBusEvents[K]
  ): boolean {
    return this.emit(event, payload);
  }

  /**
   * Returns true when the worker's last event-driven trigger was more than
   * FALLBACK_IDLE_MS ago (or it has never been triggered).
   *
   * Scheduled interval callbacks use this to decide whether to run:
   *   if (workerEventBus.shouldFallback('security')) await runWorker('security');
   */
  shouldFallback(workerName: string): boolean {
    const last = this.lastTriggered.get(workerName);
    if (last === undefined) return true;
    return Date.now() - last > FALLBACK_IDLE_MS;
  }

  /**
   * Reset the trigger timestamp for a worker, forcing the next interval
   * check to consider it idle and eligible for fallback execution.
   */
  resetTrigger(workerName: string): void {
    this.lastTriggered.delete(workerName);
  }

  /**
   * Return a snapshot of all workers and when they were last triggered.
   * Useful for diagnostics and status commands.
   */
  getTriggerStats(): Record<string, { lastTriggeredMs: number; idleMs: number }> {
    const now = Date.now();
    const stats: Record<string, { lastTriggeredMs: number; idleMs: number }> = {};
    for (const [name, ts] of this.lastTriggered) {
      stats[name] = { lastTriggeredMs: ts, idleMs: now - ts };
    }
    return stats;
  }
}

// ============================================================================
// Singleton
// ============================================================================

/**
 * Module-level singleton WorkerEventBus.
 *
 * Import this wherever you need to emit or listen:
 *   import { workerEventBus } from './event-bus.js';
 */
export const workerEventBus = new WorkerEventBus();
