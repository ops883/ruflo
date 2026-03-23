/**
 * @claude-flow/memory-federation
 *
 * Distributed federated AgentDB memory across machines.
 * Uses CRDTs for conflict-free replication, gossip protocol for anti-entropy
 * synchronisation, consistent hashing for shard routing, and mDNS / STUN
 * for peer discovery on LAN and WAN respectively.
 *
 * @module @claude-flow/memory-federation
 */

// CRDTs
export { LWWRegister, HybridLogicalClock } from './crdt/lww-register.js';
export type { LWWEntry, HLCState } from './crdt/lww-register.js';

export { ORSet } from './crdt/or-set.js';

// Sharding
export { HashRing } from './sharding/hash-ring.js';
export type { RingNode } from './sharding/hash-ring.js';

export { ShardRouter } from './sharding/shard-router.js';

// Sync
export { VersionVector } from './sync/version-vector.js';

export { GossipProtocol } from './sync/gossip-protocol.js';
export type { GossipPeer, GossipMessage, GossipDigestEntry } from './sync/gossip-protocol.js';

// Discovery
export { MDNSPeerDiscovery } from './discovery/mdns-peer.js';

export { STUNTraversal } from './discovery/stun-traversal.js';
export type { STUNResult } from './discovery/stun-traversal.js';

// Top-level service
export { FederationService } from './federation-service.js';
export type { FederationConfig, FederationStatus } from './federation-service.js';
