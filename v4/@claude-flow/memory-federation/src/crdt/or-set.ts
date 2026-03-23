/**
 * OR-Set (Observed-Remove Set) CRDT
 *
 * Supports concurrent add and remove operations without conflicts.
 * Each element is tagged with a unique identifier on add; remove marks
 * all known tags for that element as tombstoned. An element is present
 * if and only if it has at least one tag that is NOT tombstoned.
 *
 * @module v4/memory-federation/crdt/or-set
 */

import { randomUUID } from 'node:crypto';

// Internal JSON shape used for serialization
interface ORSetJSON<T> {
  adds: Array<[string, string[]]>;    // [element-key, [tag, tag, ...]]
  removes: Array<[string, string[]]>; // [element-key, [tag, tag, ...]]
}

/**
 * OR-Set (Observed-Remove Set) CRDT.
 *
 * Type parameter T must be JSON-serializable so elements can be used as Map keys.
 * Internally elements are stored by their JSON-stringified form.
 */
export class ORSet<T> {
  // element-key → set of live (add) tags
  private adds: Map<string, Set<string>> = new Map();
  // element-key → set of tombstoned tags
  private removes: Map<string, Set<string>> = new Map();

  /** Convert a value to a stable string key. */
  private toKey(element: T): string {
    return JSON.stringify(element);
  }

  /**
   * Add an element to the set.
   * Generates a unique tag; the element will be visible even if it was
   * previously removed (add-wins after a remove is concurrent).
   */
  add(element: T): void {
    const key = this.toKey(element);
    const tag = randomUUID();

    if (!this.adds.has(key)) {
      this.adds.set(key, new Set());
    }
    this.adds.get(key)!.add(tag);
  }

  /**
   * Remove an element from the set.
   * Moves all currently observed add-tags for this element to the remove set.
   * Tags added concurrently (not yet seen here) will keep the element visible.
   */
  remove(element: T): void {
    const key = this.toKey(element);
    const liveTags = this.adds.get(key);
    if (!liveTags || liveTags.size === 0) return;

    if (!this.removes.has(key)) {
      this.removes.set(key, new Set());
    }
    const tombstones = this.removes.get(key)!;
    for (const tag of liveTags) {
      tombstones.add(tag);
    }
  }

  /**
   * Check whether an element is currently in the set.
   * True iff (adds - removes) is non-empty for this element.
   */
  has(element: T): boolean {
    const key = this.toKey(element);
    const liveTags = this.adds.get(key);
    if (!liveTags || liveTags.size === 0) return false;

    const tombstones = this.removes.get(key) ?? new Set<string>();
    for (const tag of liveTags) {
      if (!tombstones.has(tag)) return true;
    }
    return false;
  }

  /**
   * Return all elements that are currently in the set (adds - removes non-empty).
   */
  values(): T[] {
    const result: T[] = [];
    for (const [key, liveTags] of this.adds) {
      if (liveTags.size === 0) continue;
      const tombstones = this.removes.get(key) ?? new Set<string>();
      for (const tag of liveTags) {
        if (!tombstones.has(tag)) {
          result.push(JSON.parse(key) as T);
          break;
        }
      }
    }
    return result;
  }

  /** Return the number of distinct elements currently in the set. */
  size(): number {
    return this.values().length;
  }

  /**
   * CRDT merge: union both adds and removes from the remote state.
   * Idempotent, commutative, and associative.
   */
  merge(remote: ORSet<T>): void {
    // Merge add tags
    for (const [key, remoteTags] of remote.adds) {
      if (!this.adds.has(key)) {
        this.adds.set(key, new Set());
      }
      const local = this.adds.get(key)!;
      for (const tag of remoteTags) {
        local.add(tag);
      }
    }

    // Merge remove (tombstone) tags
    for (const [key, remoteTombstones] of remote.removes) {
      if (!this.removes.has(key)) {
        this.removes.set(key, new Set());
      }
      const local = this.removes.get(key)!;
      for (const tag of remoteTombstones) {
        local.add(tag);
      }
    }
  }

  /**
   * Serialize the OR-Set to a plain JSON-safe object.
   */
  toJSON(): ORSetJSON<T> {
    const adds: Array<[string, string[]]> = [];
    for (const [key, tags] of this.adds) {
      adds.push([key, Array.from(tags)]);
    }

    const removes: Array<[string, string[]]> = [];
    for (const [key, tags] of this.removes) {
      removes.push([key, Array.from(tags)]);
    }

    return { adds, removes };
  }

  /**
   * Deserialize from a plain object produced by toJSON().
   */
  static fromJSON<T>(data: ORSetJSON<T>): ORSet<T> {
    const set = new ORSet<T>();

    for (const [key, tags] of data.adds) {
      set.adds.set(key, new Set(tags));
    }
    for (const [key, tags] of data.removes) {
      set.removes.set(key, new Set(tags));
    }

    return set;
  }

  /**
   * Create a new ORSet that is the merge of two existing sets.
   * Neither operand is mutated.
   */
  static merge<T>(a: ORSet<T>, b: ORSet<T>): ORSet<T> {
    const result = new ORSet<T>();
    result.merge(a);
    result.merge(b);
    return result;
  }
}
