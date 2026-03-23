/**
 * Shard Router
 *
 * Routes memory reads and writes to the correct peer shard using the consistent
 * hash ring. Implements read-your-writes consistency via sticky sessions:
 * after a write, the writing session will prefer the same shard for reads until
 * the session is cleared or the shard is removed.
 *
 * @module v4/memory-federation/sharding/shard-router
 */

import { HashRing, RingNode } from './hash-ring.js';

// ===== Shard Router =====

export class ShardRouter {
  /**
   * Maps sessionId → nodeId of the shard last written by that session.
   * Cleared when the shard is removed or the session is explicitly cleared.
   */
  private sessionStickiness: Map<string, string> = new Map();

  constructor(private ring: HashRing) {}

  /**
   * Route a write operation to the primary shard for the given key.
   * Records the target shard in the session stickiness map so subsequent
   * reads in the same session will be directed there (read-your-writes).
   *
   * @param key       Memory key to route
   * @param sessionId Optional session identifier for stickiness
   * @returns         Primary RingNode, or null if ring is empty
   */
  routeWrite(key: string, sessionId?: string): RingNode | null {
    const node = this.ring.getNode(key);
    if (node && sessionId) {
      this.sessionStickiness.set(sessionId, node.id);
    }
    return node;
  }

  /**
   * Route a read operation, preferring the sticky shard for the session if
   * it still owns the key (read-your-writes). Falls back to the canonical
   * shard if no stickiness is recorded or the sticky node is gone.
   *
   * @param key       Memory key to route
   * @param sessionId Optional session identifier for stickiness
   * @returns         Target RingNode, or null if ring is empty
   */
  routeRead(key: string, sessionId?: string): RingNode | null {
    if (sessionId) {
      const stickyNodeId = this.sessionStickiness.get(sessionId);
      if (stickyNodeId) {
        // Check if the sticky node still owns this key
        const canonical = this.ring.getNode(key);
        if (canonical?.id === stickyNodeId) {
          return canonical;
        }

        // Sticky node exists but no longer owns this key (e.g. rebalance)
        // Fall through to canonical routing below
      }
    }

    return this.ring.getNode(key);
  }

  /**
   * Return N replica nodes responsible for a key.
   * Used when writing with a replication factor > 1 to fan out writes.
   *
   * @param key               Memory key
   * @param replicationFactor Number of replicas desired
   * @returns                 Up to replicationFactor distinct RingNodes
   */
  getReplicaNodes(key: string, replicationFactor: number): RingNode[] {
    return this.ring.getNodes(key, replicationFactor);
  }

  /**
   * Clear the stickiness record for a session (e.g. on session logout).
   */
  clearSession(sessionId: string): void {
    this.sessionStickiness.delete(sessionId);
  }

  /**
   * Clear all session stickiness records for a given node.
   * Called when a peer leaves the ring to avoid routing to a dead node.
   */
  evictNode(nodeId: string): void {
    for (const [sessionId, stuckNodeId] of this.sessionStickiness) {
      if (stuckNodeId === nodeId) {
        this.sessionStickiness.delete(sessionId);
      }
    }
  }

  /** Number of active sticky sessions. */
  get activeSessionCount(): number {
    return this.sessionStickiness.size;
  }
}
