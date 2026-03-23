/**
 * Version Vector
 *
 * Tracks causal history of distributed updates. Each node in the cluster
 * maintains a counter. The vector represents the number of updates from
 * each node that have been observed. Used to determine whether two states
 * are causally ordered or concurrent (and thus require conflict resolution).
 *
 * @module v4/memory-federation/sync/version-vector
 */

// ===== Version Vector =====

export class VersionVector {
  private clocks: Map<string, number>;

  constructor(initial?: Record<string, number>) {
    this.clocks = new Map(Object.entries(initial ?? {}));
  }

  /**
   * Increment the clock for the given nodeId.
   * Called when the local node performs a write.
   */
  increment(nodeId: string): void {
    this.clocks.set(nodeId, (this.clocks.get(nodeId) ?? 0) + 1);
  }

  /**
   * Return the current counter for a node (0 if not seen yet).
   */
  get(nodeId: string): number {
    return this.clocks.get(nodeId) ?? 0;
  }

  /**
   * Merge the remote vector into this one by taking the max of each clock.
   * After merge this vector dominates both the old local state and the remote.
   */
  merge(remote: VersionVector): void {
    for (const [nodeId, remoteCount] of remote.clocks) {
      const localCount = this.clocks.get(nodeId) ?? 0;
      if (remoteCount > localCount) {
        this.clocks.set(nodeId, remoteCount);
      }
    }
  }

  /**
   * Return true if this vector dominates (is >= in every component) `other`.
   * Semantics: every event seen by `other` has also been seen by `this`.
   */
  dominates(other: VersionVector): boolean {
    for (const [nodeId, otherCount] of other.clocks) {
      if ((this.clocks.get(nodeId) ?? 0) < otherCount) return false;
    }
    return true;
  }

  /**
   * Return true if the two vectors are causally concurrent, meaning neither
   * dominates the other. This indicates a write conflict that must be resolved.
   */
  concurrent(other: VersionVector): boolean {
    return !this.dominates(other) && !other.dominates(this);
  }

  /**
   * Return true if this vector is strictly identical to `other` (same clocks,
   * same counts for all nodeIds in either vector).
   */
  equals(other: VersionVector): boolean {
    return this.dominates(other) && other.dominates(this);
  }

  /**
   * Return a new VersionVector that is the result of merging this and `other`.
   * Neither operand is mutated.
   */
  static merge(a: VersionVector, b: VersionVector): VersionVector {
    const result = VersionVector.fromJSON(a.toJSON());
    result.merge(b);
    return result;
  }

  /**
   * Return all nodeIds tracked by this vector.
   */
  nodeIds(): string[] {
    return Array.from(this.clocks.keys());
  }

  /**
   * Serialize to a plain JSON-safe object.
   */
  toJSON(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.clocks) {
      out[k] = v;
    }
    return out;
  }

  /**
   * Deserialize from a plain object produced by toJSON().
   */
  static fromJSON(data: Record<string, number>): VersionVector {
    return new VersionVector(data);
  }

  /** Human-readable representation for debugging. */
  toString(): string {
    const pairs = Array.from(this.clocks.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    return `VV{${pairs}}`;
  }
}
