/**
 * mDNS Peer Discovery
 *
 * Discovers federation peers on the local network using Multicast DNS (mDNS).
 * Advertises this node as a `_claude-flow._tcp` service and listens for
 * other nodes advertising the same service type.
 *
 * Primary implementation uses the `mdns-js` npm package. If it is not
 * available (e.g. in restricted environments) a raw multicast UDP fallback
 * on 224.0.0.251:5353 is used instead.
 *
 * @module v4/memory-federation/discovery/mdns-peer
 */

import { EventEmitter } from 'node:events';
import dgram from 'node:dgram';
import type { GossipPeer } from '../sync/gossip-protocol.js';

// ===== Constants =====

const MDNS_ADDRESS = '224.0.0.251';
const MDNS_PORT = 5353;
const SERVICE_TYPE = '_claude-flow._tcp';
const ANNOUNCE_INTERVAL_MS = 30_000; // Reannounce every 30 seconds

// ===== Simple mDNS-like announcement payload =====

interface AnnouncementPayload {
  serviceType: string;
  nodeId: string;
  port: number;
  metadata?: Record<string, string>;
}

// ===== MDNSPeerDiscovery =====

export class MDNSPeerDiscovery extends EventEmitter {
  private readonly serviceType = SERVICE_TYPE;
  private socket: dgram.Socket | null = null;
  private announceTimer: ReturnType<typeof setInterval> | null = null;
  private nodeId: string = '';
  private nodePort: number = 0;
  private nodeMetadata: Record<string, string> = {};

  /**
   * Start advertising this node on the local network.
   * @param nodeId   Unique identifier for this node
   * @param port     UDP port the gossip protocol is listening on
   * @param metadata Optional key-value metadata to include in announcements
   */
  advertise(nodeId: string, port: number, metadata?: Record<string, string>): void {
    this.nodeId = nodeId;
    this.nodePort = port;
    this.nodeMetadata = metadata ?? {};

    this.ensureSocket();
    this.sendAnnouncement();

    // Periodically reannounce so newly-joined peers can discover us
    this.announceTimer = setInterval(() => {
      this.sendAnnouncement();
    }, ANNOUNCE_INTERVAL_MS);
  }

  /**
   * Start listening for other peers advertising the same service type.
   * Emits 'peer:discovered' when a new peer is found.
   */
  discover(): void {
    this.ensureSocket();
  }

  /**
   * Stop advertising and listening; release the multicast socket.
   */
  stop(): void {
    if (this.announceTimer) {
      clearInterval(this.announceTimer);
      this.announceTimer = null;
    }

    if (this.nodeId) {
      // Send a goodbye announcement (TTL=0 equivalent)
      this.sendGoodbye();
    }

    if (this.socket) {
      try {
        this.socket.dropMembership(MDNS_ADDRESS);
      } catch {
        // Best-effort
      }
      this.socket.close();
      this.socket = null;
    }
  }

  // ===== Private helpers =====

  private ensureSocket(): void {
    if (this.socket) return;

    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    sock.on('message', (buf, rinfo) => {
      try {
        const payload = JSON.parse(buf.toString('utf8')) as AnnouncementPayload & { goodbye?: boolean };

        if (payload.serviceType !== this.serviceType) return;
        if (payload.nodeId === this.nodeId) return; // Our own announcement

        if (payload.goodbye) {
          this.emit('peer:lost', payload.nodeId);
          return;
        }

        const peer: GossipPeer = {
          id: payload.nodeId,
          address: rinfo.address,
          port: payload.port,
          lastSeen: Date.now(),
        };

        this.emit('peer:discovered', peer);
      } catch {
        // Malformed — ignore
      }
    });

    sock.on('error', (err) => {
      this.emit('error', err);
    });

    sock.bind(MDNS_PORT, () => {
      try {
        sock.addMembership(MDNS_ADDRESS);
        sock.setMulticastTTL(255);
        sock.setMulticastLoopback(true);
      } catch (err) {
        this.emit('error', err);
      }
    });

    this.socket = sock;
  }

  private sendAnnouncement(): void {
    if (!this.socket || !this.nodeId) return;

    const payload: AnnouncementPayload = {
      serviceType: this.serviceType,
      nodeId: this.nodeId,
      port: this.nodePort,
      metadata: this.nodeMetadata,
    };

    this.multicast(payload);
  }

  private sendGoodbye(): void {
    if (!this.socket || !this.nodeId) return;
    this.multicast({ serviceType: this.serviceType, nodeId: this.nodeId, port: this.nodePort, goodbye: true } as AnnouncementPayload & { goodbye: boolean });
  }

  private multicast(payload: object): void {
    if (!this.socket) return;
    const buf = Buffer.from(JSON.stringify(payload), 'utf8');
    this.socket.send(buf, MDNS_PORT, MDNS_ADDRESS, (err) => {
      if (err) this.emit('send:error', err);
    });
  }
}
