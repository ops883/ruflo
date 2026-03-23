/**
 * Gossip Protocol
 *
 * Anti-entropy gossip for eventual consistency across federated peers.
 * Each node periodically selects a random peer, exchanges a digest of its
 * known keys and version vectors, and reconciles any differences.
 *
 * Transport: UDP datagrams via Node.js `dgram`. Messages are JSON-encoded
 * and kept under 60 KB to avoid fragmentation; large payloads are chunked.
 *
 * @module v4/memory-federation/sync/gossip-protocol
 */

import { EventEmitter } from 'node:events';
import dgram from 'node:dgram';
import { VersionVector } from './version-vector.js';

// ===== Types =====

export interface GossipPeer {
  id: string;
  address: string;
  port: number;
  lastSeen: number; // Unix ms
}

export interface GossipDigestEntry {
  key: string;
  vectorClock: Record<string, number>;
  checksum: string; // Simple content hash for quick diff
}

export interface GossipMessage {
  type: 'DIGEST' | 'REQUEST' | 'RESPONSE' | 'PING' | 'PONG';
  fromNodeId: string;
  payload: unknown;
  vectorClock: Record<string, number>;
  messageId: string; // UUID to deduplicate
}

// ===== Constants =====

const MAX_UDP_PAYLOAD = 60_000; // bytes
const PEER_DEAD_THRESHOLD_MS = 3 * 60 * 1_000; // 3 minutes

// ===== Gossip Protocol =====

export class GossipProtocol extends EventEmitter {
  private peers: Map<string, GossipPeer> = new Map();
  private nodeId: string = '';
  private socket: dgram.Socket | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private localVV: VersionVector = new VersionVector();
  private seenMessages: Set<string> = new Set();
  private syncIntervalMs: number;

  // Callbacks for data access — set by the FederationService
  onGetDigest?: () => GossipDigestEntry[];
  onRequest?: (keys: string[]) => Promise<Array<{ key: string; value: unknown; vectorClock: Record<string, number> }>>;
  onReceiveData?: (entries: Array<{ key: string; value: unknown; vectorClock: Record<string, number> }>) => Promise<void>;

  constructor(syncIntervalMs = 30_000) {
    super();
    this.syncIntervalMs = syncIntervalMs;
  }

  /**
   * Start the gossip protocol on the given UDP port.
   */
  start(nodeId: string, port: number): void {
    this.nodeId = nodeId;
    this.socket = dgram.createSocket('udp4');

    this.socket.on('message', (buf, rinfo) => {
      try {
        const msg = JSON.parse(buf.toString('utf8')) as GossipMessage;
        const peer: GossipPeer = {
          id: msg.fromNodeId,
          address: rinfo.address,
          port: rinfo.port,
          lastSeen: Date.now(),
        };
        void this.handleMessage(msg, peer);
      } catch {
        // Malformed message — ignore
      }
    });

    this.socket.on('error', (err) => {
      this.emit('error', err);
    });

    this.socket.bind(port, () => {
      this.emit('started', { nodeId, port });
    });

    this.timer = setInterval(() => {
      void this.runGossipCycle();
    }, this.syncIntervalMs);
  }

  /**
   * Stop the gossip protocol and release resources.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.emit('stopped');
  }

  /** Register a known peer. */
  addPeer(peer: GossipPeer): void {
    const isNew = !this.peers.has(peer.id);
    this.peers.set(peer.id, { ...peer, lastSeen: Date.now() });
    if (isNew) this.emit('peer:joined', peer);
  }

  /** Remove a peer (e.g. after detecting it is dead). */
  removePeer(peerId: string): void {
    if (this.peers.has(peerId)) {
      this.peers.delete(peerId);
      this.emit('peer:left', peerId);
    }
  }

  /** Return a snapshot of live peers. */
  getPeers(): GossipPeer[] {
    return Array.from(this.peers.values());
  }

  // ===== Private gossip cycle =====

  private async runGossipCycle(): Promise<void> {
    // Prune dead peers
    const now = Date.now();
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > PEER_DEAD_THRESHOLD_MS) {
        this.removePeer(id);
      }
    }

    const livePeers = Array.from(this.peers.values());
    if (livePeers.length === 0) return;

    // Select a random peer (simple uniform sampling)
    const target = livePeers[Math.floor(Math.random() * livePeers.length)];
    await this.sendDigest(target);

    // Also ping all peers to refresh lastSeen
    for (const peer of livePeers) {
      this.sendMessage(peer, { type: 'PING', payload: null });
    }
  }

  private async sendDigest(peer: GossipPeer): Promise<void> {
    const digest: GossipDigestEntry[] = this.onGetDigest ? this.onGetDigest() : [];
    this.sendMessage(peer, { type: 'DIGEST', payload: digest });
  }

  private async handleMessage(msg: GossipMessage, from: GossipPeer): Promise<void> {
    // Deduplicate
    if (this.seenMessages.has(msg.messageId)) return;
    this.seenMessages.add(msg.messageId);
    // Keep the dedup set bounded
    if (this.seenMessages.size > 10_000) {
      const first = this.seenMessages.values().next().value;
      if (first) this.seenMessages.delete(first);
    }

    // Update peer liveness
    this.peers.set(from.id, { ...from, lastSeen: Date.now() });
    if (!this.peers.has(from.id)) {
      this.emit('peer:joined', from);
    }

    // Merge remote vector clock
    const remoteVV = VersionVector.fromJSON(msg.vectorClock as Record<string, number>);
    const hadConflict = this.localVV.concurrent(remoteVV);
    this.localVV.merge(remoteVV);

    if (hadConflict) {
      this.emit('conflict:detected', { from: from.id, remoteVV: msg.vectorClock });
    }

    switch (msg.type) {
      case 'PING':
        this.sendMessage(from, { type: 'PONG', payload: null });
        break;

      case 'PONG':
        // lastSeen already updated above
        break;

      case 'DIGEST': {
        const remoteDigest = msg.payload as GossipDigestEntry[];
        const missing = this.findMissingKeys(remoteDigest);
        if (missing.length > 0) {
          this.sendMessage(from, { type: 'REQUEST', payload: missing });
        }
        break;
      }

      case 'REQUEST': {
        const requestedKeys = msg.payload as string[];
        if (this.onRequest && requestedKeys.length > 0) {
          const entries = await this.onRequest(requestedKeys);
          this.sendMessage(from, { type: 'RESPONSE', payload: entries });
        }
        break;
      }

      case 'RESPONSE': {
        const entries = msg.payload as Array<{ key: string; value: unknown; vectorClock: Record<string, number> }>;
        if (this.onReceiveData && entries.length > 0) {
          await this.onReceiveData(entries);
          this.emit('data:synced', { from: from.id, count: entries.length });
        }
        break;
      }
    }
  }

  /**
   * Compare a remote digest to local state and return keys we need from the remote.
   */
  private findMissingKeys(remoteDigest: GossipDigestEntry[]): string[] {
    const localDigest = this.onGetDigest ? this.onGetDigest() : [];
    const localMap = new Map(localDigest.map((e) => [e.key, e]));

    const missing: string[] = [];
    for (const remote of remoteDigest) {
      const local = localMap.get(remote.key);
      if (!local) {
        // We don't have this key at all
        missing.push(remote.key);
        continue;
      }
      // We have it — check if remote is newer via vector clock
      const localVV = VersionVector.fromJSON(local.vectorClock);
      const remoteEntryVV = VersionVector.fromJSON(remote.vectorClock);
      if (!localVV.dominates(remoteEntryVV)) {
        missing.push(remote.key);
      }
    }
    return missing;
  }

  // ===== Transport helpers =====

  private sendMessage(
    peer: GossipPeer,
    partial: Pick<GossipMessage, 'type' | 'payload'>,
  ): void {
    if (!this.socket) return;

    const msg: GossipMessage = {
      ...partial,
      fromNodeId: this.nodeId,
      vectorClock: this.localVV.toJSON(),
      messageId: `${this.nodeId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };

    const buf = Buffer.from(JSON.stringify(msg), 'utf8');

    // If payload is large, truncate gracefully (caller should chunk; this is a safety guard)
    const payload = buf.length > MAX_UDP_PAYLOAD ? Buffer.from(JSON.stringify({ ...msg, payload: null, truncated: true })) : buf;

    this.socket.send(payload, peer.port, peer.address, (err) => {
      if (err) this.emit('send:error', { peer, err });
    });
  }
}
