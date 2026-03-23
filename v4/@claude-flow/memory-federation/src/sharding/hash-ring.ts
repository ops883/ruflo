/**
 * Consistent Hash Ring
 *
 * Distributes memory keys across peer nodes using consistent hashing with
 * virtual nodes (vnodes). Adding or removing a peer only rebalances a small
 * fraction of keys (1/N on average), minimising data movement.
 *
 * Uses FNV-1a (32-bit) for fast, well-distributed hashing.
 *
 * @module v4/memory-federation/sharding/hash-ring
 */

// ===== Types =====

export interface RingNode {
  /** Unique peer identifier */
  id: string;
  /** host:port address string */
  address: string;
  /** Number of virtual nodes placed on the ring (default 150) */
  virtualNodes?: number;
}

// ===== FNV-1a 32-bit hash =====

const FNV_PRIME = 0x01000193;
const FNV_OFFSET = 0x811c9dc5;

/**
 * FNV-1a 32-bit hash of a string.
 * Returns a non-negative 32-bit integer.
 */
function fnv1a32(str: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // Multiply mod 2^32 using unsigned 32-bit arithmetic
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

// ===== Hash Ring =====

const DEFAULT_VIRTUAL_NODES = 150;

export class HashRing {
  /** hash position → ring node */
  private ring: Map<number, RingNode> = new Map();
  /** sorted list of hash positions for binary search */
  private sortedHashes: number[] = [];
  /** nodeId → list of virtual-node hashes owned by that peer */
  private nodeHashes: Map<string, number[]> = new Map();

  /**
   * Add a peer and distribute its virtual nodes across the ring.
   */
  addNode(node: RingNode): void {
    const vnodes = node.virtualNodes ?? DEFAULT_VIRTUAL_NODES;
    const hashes: number[] = [];

    for (let i = 0; i < vnodes; i++) {
      const virtualKey = `${node.id}#${i}`;
      const hash = this.hash(virtualKey);
      this.ring.set(hash, node);
      hashes.push(hash);
    }

    this.nodeHashes.set(node.id, hashes);
    this.rebuildSortedHashes();
  }

  /**
   * Remove a peer and all its virtual nodes from the ring.
   */
  removeNode(nodeId: string): void {
    const hashes = this.nodeHashes.get(nodeId);
    if (!hashes) return;

    for (const hash of hashes) {
      this.ring.delete(hash);
    }
    this.nodeHashes.delete(nodeId);
    this.rebuildSortedHashes();
  }

  /**
   * Determine which peer owns a given key using consistent hashing.
   * Returns null if the ring is empty.
   */
  getNode(key: string): RingNode | null {
    if (this.sortedHashes.length === 0) return null;

    const hash = this.hash(key);
    const idx = this.findInsertionPoint(hash);
    // Wrap around to first node if past the end
    const ringPos = this.sortedHashes[idx % this.sortedHashes.length];
    return this.ring.get(ringPos) ?? null;
  }

  /**
   * Return the N distinct peer nodes responsible for a key (for replication).
   * Walks clockwise around the ring, deduplicating by nodeId.
   */
  getNodes(key: string, count: number): RingNode[] {
    if (this.sortedHashes.length === 0) return [];

    const hash = this.hash(key);
    const startIdx = this.findInsertionPoint(hash);
    const seen = new Set<string>();
    const result: RingNode[] = [];

    for (let i = 0; i < this.sortedHashes.length && result.length < count; i++) {
      const ringPos = this.sortedHashes[(startIdx + i) % this.sortedHashes.length];
      const node = this.ring.get(ringPos);
      if (node && !seen.has(node.id)) {
        seen.add(node.id);
        result.push(node);
      }
    }

    return result;
  }

  /**
   * Return all distinct nodes currently on the ring.
   */
  getAllNodes(): RingNode[] {
    const seen = new Set<string>();
    const result: RingNode[] = [];
    for (const node of this.ring.values()) {
      if (!seen.has(node.id)) {
        seen.add(node.id);
        result.push(node);
      }
    }
    return result;
  }

  /** Number of distinct peer nodes on the ring. */
  get nodeCount(): number {
    return this.nodeHashes.size;
  }

  /**
   * After adding a new node, compute which existing keys should migrate to it.
   * Returns a map from key→newNodeId for each affected virtual position.
   *
   * Callers typically iterate their local key space and use getNode() per key
   * instead of this method; rebalance() is provided for diagnostics / planning.
   */
  rebalance(): Map<string, string> {
    // For each virtual-node hash that was just added, the keys that used to go
    // to the successor of that hash now belong to the new node.
    // We return a map of virtualKey → ownerNodeId for all ring positions.
    const mapping = new Map<string, string>();
    for (const [hash, node] of this.ring) {
      mapping.set(String(hash), node.id);
    }
    return mapping;
  }

  // ===== Private helpers =====

  /** FNV-1a hash used internally (exposed for testability). */
  private hash(key: string): number {
    return fnv1a32(key);
  }

  /** Rebuild the sorted array after any ring mutation. */
  private rebuildSortedHashes(): void {
    this.sortedHashes = Array.from(this.ring.keys()).sort((a, b) => a - b);
  }

  /**
   * Binary search: find the index of the first hash >= target.
   * Wraps to 0 if all hashes are smaller (clockwise wrap).
   */
  private findInsertionPoint(target: number): number {
    let lo = 0;
    let hi = this.sortedHashes.length;

    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.sortedHashes[mid] < target) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    // Wrap around
    return lo % this.sortedHashes.length;
  }
}
