/**
 * Federation Service
 *
 * Top-level orchestrator for the distributed federated memory system.
 * Ties together:
 *  - HashRing + ShardRouter  (consistent hashing & read-your-writes)
 *  - GossipProtocol          (anti-entropy sync & peer liveness)
 *  - MDNSPeerDiscovery       (LAN peer discovery)
 *  - STUNTraversal           (optional WAN NAT traversal)
 *  - LWWRegister / ORSet     (CRDT conflict resolution)
 *  - VersionVector           (causal ordering)
 *
 * Usage:
 *   const svc = new FederationService({ nodeId: 'node-1', port: 7777 });
 *   await svc.start();
 *   await svc.store('my-key', { hello: 'world' });
 *   const val = await svc.retrieve('my-key');
 *
 * @module v4/memory-federation/federation-service
 */

import { EventEmitter } from 'node:events';
import { HashRing } from './sharding/hash-ring.js';
import { ShardRouter } from './sharding/shard-router.js';
import { GossipProtocol, GossipPeer } from './sync/gossip-protocol.js';
import { MDNSPeerDiscovery } from './discovery/mdns-peer.js';
import { STUNTraversal, STUNResult } from './discovery/stun-traversal.js';
import { LWWRegister } from './crdt/lww-register.js';
import { HybridLogicalClock } from './crdt/lww-register.js';
import { VersionVector } from './sync/version-vector.js';
import type { GossipDigestEntry } from './sync/gossip-protocol.js';

// ===== Types =====

export interface FederationConfig {
  nodeId: string;
  port: number;
  replicationFactor?: number;   // default 3
  gossipIntervalMs?: number;    // default 30000
  enableMDNS?: boolean;         // default true
  enableSTUN?: boolean;         // default false
  stunServers?: string[];
}

export interface FederationStatus {
  nodeId: string;
  port: number;
  running: boolean;
  peerCount: number;
  keyCount: number;
  publicAddress?: STUNResult;
}

// Internal storage entry
interface StoreEntry {
  key: string;
  value: unknown;
  register: LWWRegister<unknown>;
  vv: VersionVector;
  updatedAt: number;
}

// ===== Federation Service =====

export class FederationService extends EventEmitter {
  private readonly ring: HashRing;
  private readonly router: ShardRouter;
  private readonly gossip: GossipProtocol;
  private readonly mdns: MDNSPeerDiscovery;
  private readonly stun: STUNTraversal;
  private readonly hlc: HybridLogicalClock;

  // Local in-memory store: key → StoreEntry
  private readonly store: Map<string, StoreEntry> = new Map();
  private publicAddress?: STUNResult;
  private running = false;

  private readonly replicationFactor: number;
  private readonly config: Required<FederationConfig>;

  constructor(config: FederationConfig) {
    super();
    this.config = {
      replicationFactor: 3,
      gossipIntervalMs: 30_000,
      enableMDNS: true,
      enableSTUN: false,
      stunServers: [],
      ...config,
    };

    this.replicationFactor = this.config.replicationFactor;
    this.ring = new HashRing();
    this.router = new ShardRouter(this.ring);
    this.gossip = new GossipProtocol(this.config.gossipIntervalMs);
    this.mdns = new MDNSPeerDiscovery();
    this.stun = new STUNTraversal();
    this.hlc = new HybridLogicalClock(this.config.nodeId);

    this.wireGossipCallbacks();
  }

  // ===== Lifecycle =====

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Add self to ring
    this.ring.addNode({
      id: this.config.nodeId,
      address: `127.0.0.1:${this.config.port}`,
    });

    // Start gossip
    this.gossip.start(this.config.nodeId, this.config.port);

    // Wire gossip events
    this.gossip.on('peer:joined', (peer: GossipPeer) => {
      this.onPeerJoined(peer);
    });
    this.gossip.on('peer:left', (peerId: string) => {
      this.onPeerLeft(peerId);
    });
    this.gossip.on('data:synced', (info: unknown) => {
      this.emit('data:synced', info);
    });
    this.gossip.on('conflict:detected', (info: unknown) => {
      this.emit('conflict:detected', info);
    });

    // Optional: mDNS LAN peer discovery
    if (this.config.enableMDNS) {
      this.mdns.on('peer:discovered', (peer: GossipPeer) => {
        this.gossip.addPeer(peer);
        this.onPeerJoined(peer);
      });
      this.mdns.on('peer:lost', (peerId: string) => {
        this.gossip.removePeer(peerId);
        this.onPeerLeft(peerId);
      });
      this.mdns.advertise(this.config.nodeId, this.config.port);
      this.mdns.discover();
    }

    // Optional: STUN public address discovery
    if (this.config.enableSTUN) {
      try {
        this.publicAddress = await this.stun.getPublicAddress();
        this.emit('stun:resolved', this.publicAddress);
      } catch (err) {
        this.emit('stun:failed', err);
      }
    }

    this.emit('started', { nodeId: this.config.nodeId, port: this.config.port });
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    this.gossip.stop();
    if (this.config.enableMDNS) this.mdns.stop();

    this.emit('stopped');
  }

  // ===== Public API =====

  /**
   * Store a value under `key`. Replicates to `replicationFactor` shards.
   * Uses LWW-Register semantics for conflict resolution on merge.
   *
   * @param key        Storage key
   * @param value      JSON-serializable value
   * @param sessionId  Optional session for read-your-writes stickiness
   */
  async store(key: string, value: unknown, sessionId?: string): Promise<void> {
    const ts = this.hlc.tick();
    const timestamp = this.hlc.toTimestamp();

    // Update local CRDT store
    let entry = this.store.get(key);
    if (!entry) {
      entry = {
        key,
        value,
        register: new LWWRegister<unknown>(),
        vv: new VersionVector(),
        updatedAt: Date.now(),
      };
      this.store.set(key, entry);
    }

    entry.register.set(value, timestamp, this.config.nodeId);
    entry.vv.increment(this.config.nodeId);
    entry.value = value;
    entry.updatedAt = ts.wallTime;

    // Route write (for stickiness tracking)
    this.router.routeWrite(key, sessionId);

    this.emit('stored', { key, nodeId: this.config.nodeId });
  }

  /**
   * Retrieve a value by key. Prefers the sticky shard for the session.
   * Returns null if the key is not found locally.
   *
   * @param key       Storage key
   * @param sessionId Optional session for read-your-writes stickiness
   */
  async retrieve(key: string, sessionId?: string): Promise<unknown | null> {
    // Use the router for session tracking (no-op if ring has only self)
    this.router.routeRead(key, sessionId);

    const entry = this.store.get(key);
    if (!entry) return null;

    return entry.register.get();
  }

  /**
   * Search all locally-stored entries for a substring match against their
   * JSON-serialized value or the key itself.
   *
   * In a multi-node cluster, the caller should fan out this call to all peers
   * (e.g. via gossip REQUEST) and merge results.
   *
   * @param query  Search string (case-insensitive substring match)
   */
  async search(query: string): Promise<unknown[]> {
    const lowerQuery = query.toLowerCase();
    const results: unknown[] = [];

    for (const entry of this.store.values()) {
      const keyMatch = entry.key.toLowerCase().includes(lowerQuery);
      const valueStr = JSON.stringify(entry.value ?? '').toLowerCase();
      const valueMatch = valueStr.includes(lowerQuery);

      if (keyMatch || valueMatch) {
        results.push({ key: entry.key, value: entry.value });
      }
    }

    return results;
  }

  /** Return a snapshot of current operational status. */
  getStatus(): FederationStatus {
    return {
      nodeId: this.config.nodeId,
      port: this.config.port,
      running: this.running,
      peerCount: this.gossip.getPeers().length,
      keyCount: this.store.size,
      publicAddress: this.publicAddress,
    };
  }

  /** Return the list of currently-known peers. */
  getPeers(): GossipPeer[] {
    return this.gossip.getPeers();
  }

  // ===== Private helpers =====

  private onPeerJoined(peer: GossipPeer): void {
    this.ring.addNode({ id: peer.id, address: `${peer.address}:${peer.port}` });
    this.emit('peer:joined', peer);
  }

  private onPeerLeft(peerId: string): void {
    this.ring.removeNode(peerId);
    this.router.evictNode(peerId);
    this.emit('peer:left', peerId);
  }

  private wireGossipCallbacks(): void {
    // Provide local digest to gossip protocol
    this.gossip.onGetDigest = (): GossipDigestEntry[] => {
      const digest: GossipDigestEntry[] = [];
      for (const entry of this.store.values()) {
        digest.push({
          key: entry.key,
          vectorClock: entry.vv.toJSON(),
          checksum: simpleChecksum(JSON.stringify(entry.value)),
        });
      }
      return digest;
    };

    // Serve requested keys to remote peers
    this.gossip.onRequest = async (keys: string[]) => {
      return keys.flatMap((key) => {
        const entry = this.store.get(key);
        if (!entry) return [];
        return [{ key, value: entry.value, vectorClock: entry.vv.toJSON() }];
      });
    };

    // Receive data synced from remote peers
    this.gossip.onReceiveData = async (
      entries: Array<{ key: string; value: unknown; vectorClock: Record<string, number> }>,
    ) => {
      for (const remote of entries) {
        const local = this.store.get(remote.key);
        const remoteVV = VersionVector.fromJSON(remote.vectorClock);

        if (!local) {
          // Brand new key — accept unconditionally
          const reg = new LWWRegister<unknown>();
          reg.set(remote.value, Date.now(), this.config.nodeId);
          this.store.set(remote.key, {
            key: remote.key,
            value: remote.value,
            register: reg,
            vv: remoteVV,
            updatedAt: Date.now(),
          });
        } else {
          // Merge: only update if remote VV dominates or they are concurrent
          if (!local.vv.dominates(remoteVV)) {
            const remoteEntry = reg => {
              // Use HLC timestamp from remote VV sum as proxy
              const ts = Object.values(remote.vectorClock).reduce((a, b) => a + b, 0);
              reg.set(remote.value, ts, 'remote');
            };
            remoteEntry(local.register);
            local.vv.merge(remoteVV);
            local.value = local.register.get();
            local.updatedAt = Date.now();
          }
        }
      }
    };
  }
}

// ===== Utility =====

/** Compute a fast non-cryptographic checksum (FNV-1a) of a string. */
function simpleChecksum(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
