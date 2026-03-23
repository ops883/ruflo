/**
 * STUN Traversal
 *
 * Implements a minimal STUN Binding Request/Response (RFC 5389) to discover
 * the public IP and port of this node and determine NAT type. Uses Node.js
 * `dgram` (UDP) directly — no external STUN libraries required.
 *
 * Also provides basic UDP hole-punching for symmetric NAT traversal.
 *
 * @module v4/memory-federation/discovery/stun-traversal
 */

import dgram from 'node:dgram';

// ===== Types =====

export interface STUNResult {
  publicIP: string;
  publicPort: number;
  natType: 'full-cone' | 'restricted' | 'symmetric' | 'unknown';
}

// ===== STUN Message Constants (RFC 5389) =====

const STUN_BINDING_REQUEST = 0x0001;
const STUN_BINDING_RESPONSE = 0x0101;
const STUN_MAGIC_COOKIE = 0x2112a442;
const STUN_TIMEOUT_MS = 5_000;
const MAPPED_ADDRESS_ATTR = 0x0001;
const XOR_MAPPED_ADDRESS_ATTR = 0x0020;

// ===== STUN Traversal =====

export class STUNTraversal {
  private stunServers = [
    { host: 'stun.l.google.com', port: 19302 },
    { host: 'stun1.l.google.com', port: 19302 },
  ];

  /**
   * Contact the configured STUN servers to discover the public IP:port of
   * this process and make a best-effort determination of NAT type.
   *
   * NAT type detection uses the two-server heuristic:
   * - If both servers return the same IP:port → full-cone or restricted
   * - If they differ → symmetric NAT
   */
  async getPublicAddress(): Promise<STUNResult> {
    let firstResult: { ip: string; port: number } | null = null;
    let secondResult: { ip: string; port: number } | null = null;

    // Query up to two STUN servers in sequence
    for (let i = 0; i < Math.min(2, this.stunServers.length); i++) {
      const server = this.stunServers[i];
      try {
        const res = await this.sendBindingRequest(server.host, server.port);
        if (i === 0) firstResult = res;
        else secondResult = res;
      } catch {
        // Try next server
      }
    }

    if (!firstResult) {
      throw new Error('Could not contact any STUN server');
    }

    let natType: STUNResult['natType'] = 'unknown';
    if (secondResult) {
      if (firstResult.ip === secondResult.ip && firstResult.port === secondResult.port) {
        natType = 'full-cone'; // Both servers see same mapping — likely full-cone or restricted
      } else {
        natType = 'symmetric'; // Different port per destination — symmetric NAT
      }
    }

    return {
      publicIP: firstResult.ip,
      publicPort: firstResult.port,
      natType,
    };
  }

  /**
   * Attempt UDP hole-punching to a remote peer.
   * Sends a series of UDP packets to the remote address to open a pinhole
   * in the NAT, then listens for a reciprocal packet from the remote side.
   *
   * Both sides must call this simultaneously (coordinated via a signalling channel).
   *
   * @returns true if the remote responded within timeout, false otherwise.
   */
  async punchHole(remoteAddress: string, remotePort: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const sock = dgram.createSocket('udp4');
      let resolved = false;

      const done = (success: boolean): void => {
        if (resolved) return;
        resolved = true;
        clearInterval(sendTimer);
        clearTimeout(timeoutTimer);
        sock.close();
        resolve(success);
      };

      const PUNCH_PAYLOAD = Buffer.from('CF_PUNCH', 'utf8');

      // Send punching packets at 500ms intervals
      const sendTimer = setInterval(() => {
        sock.send(PUNCH_PAYLOAD, remotePort, remoteAddress, () => {});
      }, 500);

      // Listen for a packet from the remote
      sock.on('message', (_buf, rinfo) => {
        if (rinfo.address === remoteAddress) {
          done(true);
        }
      });

      sock.on('error', () => done(false));

      const timeoutTimer = setTimeout(() => done(false), STUN_TIMEOUT_MS);

      sock.bind(0, () => {
        // Start sending immediately after binding
        sock.send(PUNCH_PAYLOAD, remotePort, remoteAddress, () => {});
      });
    });
  }

  // ===== Private helpers =====

  /**
   * Send a STUN Binding Request and parse the response.
   * Implements the mandatory parts of RFC 5389 §§ 6–7.
   */
  private sendBindingRequest(
    host: string,
    port: number,
  ): Promise<{ ip: string; port: number }> {
    return new Promise<{ ip: string; port: number }>((resolve, reject) => {
      const sock = dgram.createSocket('udp4');
      let settled = false;

      const cleanup = (): void => {
        if (!settled) {
          settled = true;
          sock.close();
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`STUN timeout connecting to ${host}:${port}`));
      }, STUN_TIMEOUT_MS);

      // Build STUN Binding Request (20-byte header + no attributes)
      const txId = buildTransactionId();
      const request = Buffer.alloc(20);
      request.writeUInt16BE(STUN_BINDING_REQUEST, 0); // Message type
      request.writeUInt16BE(0, 2);                     // Message length (no attrs)
      request.writeUInt32BE(STUN_MAGIC_COOKIE, 4);     // Magic cookie
      txId.copy(request, 8);                           // 12-byte transaction ID

      sock.on('message', (buf) => {
        try {
          const result = parseStunResponse(buf);
          if (result) {
            clearTimeout(timer);
            cleanup();
            resolve(result);
          }
        } catch {
          // Malformed response — keep waiting
        }
      });

      sock.on('error', (err) => {
        clearTimeout(timer);
        cleanup();
        reject(err);
      });

      sock.bind(0, () => {
        sock.send(request, port, host, (err) => {
          if (err) {
            clearTimeout(timer);
            cleanup();
            reject(err);
          }
        });
      });
    });
  }
}

// ===== STUN message helpers =====

function buildTransactionId(): Buffer {
  const buf = Buffer.alloc(12);
  for (let i = 0; i < 12; i++) {
    buf[i] = Math.floor(Math.random() * 256);
  }
  return buf;
}

/**
 * Parse a STUN response buffer and extract the mapped address.
 * Handles both MAPPED-ADDRESS (0x0001) and XOR-MAPPED-ADDRESS (0x0020).
 */
function parseStunResponse(buf: Buffer): { ip: string; port: number } | null {
  if (buf.length < 20) return null;

  const msgType = buf.readUInt16BE(0);
  if (msgType !== STUN_BINDING_RESPONSE) return null;

  const msgLen = buf.readUInt16BE(2);
  if (buf.length < 20 + msgLen) return null;

  let offset = 20;
  while (offset < 20 + msgLen) {
    if (offset + 4 > buf.length) break;
    const attrType = buf.readUInt16BE(offset);
    const attrLen = buf.readUInt16BE(offset + 2);
    offset += 4;

    if (attrType === XOR_MAPPED_ADDRESS_ATTR && attrLen >= 8) {
      // XOR-MAPPED-ADDRESS: family (1 byte padding + 1 byte), port, IP
      const family = buf.readUInt8(offset + 1);
      if (family !== 0x01) break; // Only IPv4 supported here
      const xorPort = buf.readUInt16BE(offset + 2) ^ (STUN_MAGIC_COOKIE >>> 16);
      const xorIp = buf.readUInt32BE(offset + 4) ^ STUN_MAGIC_COOKIE;
      return { ip: uint32ToIPv4(xorIp), port: xorPort };
    }

    if (attrType === MAPPED_ADDRESS_ATTR && attrLen >= 8) {
      const family = buf.readUInt8(offset + 1);
      if (family !== 0x01) break;
      const p = buf.readUInt16BE(offset + 2);
      const ip = uint32ToIPv4(buf.readUInt32BE(offset + 4));
      return { ip, port: p };
    }

    // Pad to 4-byte boundary
    offset += attrLen + ((4 - (attrLen % 4)) % 4);
  }

  return null;
}

function uint32ToIPv4(n: number): string {
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ].join('.');
}
