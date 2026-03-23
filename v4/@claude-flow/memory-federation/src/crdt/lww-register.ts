/**
 * LWW Register (Last-Write-Wins Register) CRDT
 *
 * A conflict-free replicated data type for scalar values where the last write
 * (by wall-clock time, broken by nodeId) always wins during merges.
 * Uses a Hybrid Logical Clock for causal ordering across distributed nodes.
 *
 * @module v4/memory-federation/crdt/lww-register
 */

// ===== Hybrid Logical Clock =====

/**
 * Hybrid Logical Clock state for a single node.
 * Combines physical wall-clock time with a logical counter for causal ordering.
 */
export interface HLCState {
  wallTime: number; // Physical time (ms since epoch)
  logical: number;  // Logical counter (incremented when wall time is unchanged)
  nodeId: string;   // Node identifier
}

/**
 * HybridLogicalClock provides monotonically increasing timestamps that preserve
 * causality across distributed nodes. Implements the HLC algorithm (Kulkarni & Demirbas 2014).
 */
export class HybridLogicalClock {
  private state: HLCState;

  constructor(nodeId: string) {
    this.state = {
      wallTime: Date.now(),
      logical: 0,
      nodeId,
    };
  }

  /**
   * Generate a new timestamp for a local event.
   * Advances wall time or increments logical counter.
   */
  tick(): HLCState {
    const now = Date.now();
    if (now > this.state.wallTime) {
      this.state = { wallTime: now, logical: 0, nodeId: this.state.nodeId };
    } else {
      this.state = {
        wallTime: this.state.wallTime,
        logical: this.state.logical + 1,
        nodeId: this.state.nodeId,
      };
    }
    return { ...this.state };
  }

  /**
   * Update local clock upon receiving a remote message.
   * Ensures local clock is always >= remote clock.
   */
  update(remoteWallTime: number, remoteLogical: number): HLCState {
    const now = Date.now();
    const maxWall = Math.max(now, this.state.wallTime, remoteWallTime);

    if (maxWall === this.state.wallTime && maxWall === remoteWallTime) {
      // Both clocks have the same wall time: increment logical
      this.state = {
        wallTime: maxWall,
        logical: Math.max(this.state.logical, remoteLogical) + 1,
        nodeId: this.state.nodeId,
      };
    } else if (maxWall === this.state.wallTime) {
      // Local wall is ahead
      this.state = {
        wallTime: maxWall,
        logical: this.state.logical + 1,
        nodeId: this.state.nodeId,
      };
    } else if (maxWall === remoteWallTime) {
      // Remote wall is ahead
      this.state = {
        wallTime: maxWall,
        logical: remoteLogical + 1,
        nodeId: this.state.nodeId,
      };
    } else {
      // Physical clock is furthest ahead
      this.state = { wallTime: maxWall, logical: 0, nodeId: this.state.nodeId };
    }

    return { ...this.state };
  }

  /** Encode timestamp as a 64-bit comparable number: wallTime * 1e6 + logical */
  toTimestamp(): number {
    return this.state.wallTime * 1_000_000 + this.state.logical;
  }

  getState(): Readonly<HLCState> {
    return { ...this.state };
  }
}

// ===== LWW Entry =====

export interface LWWEntry<T> {
  value: T;
  timestamp: number; // HLC-derived monotonic timestamp
  nodeId: string;    // Tie-breaker for equal timestamps
}

// ===== LWW Register =====

/**
 * Last-Write-Wins Register CRDT.
 * Concurrent writes resolve by comparing timestamps; ties broken by nodeId (lexicographic).
 */
export class LWWRegister<T> {
  private entry: LWWEntry<T> | null = null;

  /**
   * Set the value if the given timestamp is strictly greater than the current.
   * If timestamps are equal, higher nodeId wins (lexicographic tie-break).
   */
  set(value: T, timestamp: number, nodeId: string): void {
    if (this.entry === null) {
      this.entry = { value, timestamp, nodeId };
      return;
    }

    if (timestamp > this.entry.timestamp) {
      this.entry = { value, timestamp, nodeId };
    } else if (timestamp === this.entry.timestamp && nodeId > this.entry.nodeId) {
      this.entry = { value, timestamp, nodeId };
    }
    // Otherwise discard — stale write
  }

  /** Return the current value, or null if never set. */
  get(): T | null {
    return this.entry !== null ? this.entry.value : null;
  }

  /**
   * CRDT merge: apply the remote entry using the same win-condition as set().
   * Idempotent and commutative.
   */
  merge(remote: LWWEntry<T>): void {
    this.set(remote.value, remote.timestamp, remote.nodeId);
  }

  /** Serialize to plain JSON-safe object. */
  toJSON(): LWWEntry<T> | null {
    return this.entry !== null ? { ...this.entry } : null;
  }

  /** Deserialize from a plain object produced by toJSON(). */
  static fromJSON<T>(data: LWWEntry<T>): LWWRegister<T> {
    const reg = new LWWRegister<T>();
    reg.entry = { ...data };
    return reg;
  }

  /** Compare two LWWEntry objects with the same win-condition. */
  static wins<T>(candidate: LWWEntry<T>, current: LWWEntry<T>): boolean {
    if (candidate.timestamp > current.timestamp) return true;
    if (candidate.timestamp === current.timestamp) {
      return candidate.nodeId > current.nodeId;
    }
    return false;
  }
}
