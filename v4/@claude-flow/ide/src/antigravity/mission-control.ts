/**
 * @claude-flow/ide - Antigravity Mission Control Sync
 *
 * Synchronises Ruflo swarm agent lifecycle events to Antigravity's
 * Mission Control dashboard. Communication uses a WebSocket channel
 * when available, falling back to an IPC-style named pipe approach.
 */

import { EventEmitter } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed' | 'waiting';

export interface AgentState {
  agentId: string;
  status: AgentStatus;
  taskId?: string;
  taskDescription?: string;
  progress?: number; // 0-100
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface AntigravityAgentEvent {
  type: 'agent:started' | 'agent:progress' | 'agent:completed' | 'agent:failed' | 'swarm:updated';
  agentId: string;
  state: AgentState;
  timestamp: Date;
}

export interface MissionControlMessage {
  protocol: 'ruflo-mission-control';
  version: '1.0';
  event: AntigravityAgentEvent;
}

export interface MissionControlSyncOptions {
  /** Port for the local WebSocket server that Antigravity connects to */
  port?: number;
  /** Host for the WebSocket server */
  host?: string;
  /** Maximum number of state history entries kept in memory */
  maxHistorySize?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

export class MissionControlSync extends EventEmitter {
  private readonly options: Required<MissionControlSyncOptions>;
  private readonly agentStates = new Map<string, AgentState>();
  private readonly stateHistory: AntigravityAgentEvent[] = [];
  private wss: WebSocketServer | null = null;
  private readonly clients = new Set<WebSocket>();
  private outboundClient: WebSocket | null = null;
  private eventHandlers = new Map<string, (event: AntigravityAgentEvent) => void>();

  constructor(options: MissionControlSyncOptions = {}) {
    super();
    this.options = {
      port: options.port ?? 7432,
      host: options.host ?? '127.0.0.1',
      maxHistorySize: options.maxHistorySize ?? 200,
    };
  }

  /**
   * Starts the local WebSocket server that Antigravity's Mission Control
   * can connect to in order to receive live agent state updates.
   */
  startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port: this.options.port,
          host: this.options.host,
        });

        this.wss.on('connection', (ws) => {
          this.clients.add(ws);

          // Send full current state to new client
          for (const [, state] of this.agentStates) {
            const catchup: MissionControlMessage = {
              protocol: 'ruflo-mission-control',
              version: '1.0',
              event: {
                type: 'swarm:updated',
                agentId: state.agentId,
                state,
                timestamp: new Date(),
              },
            };
            ws.send(JSON.stringify(catchup));
          }

          ws.on('message', (data) => {
            try {
              const msg = JSON.parse(data.toString()) as AntigravityAgentEvent;
              this.handleInboundEvent(msg);
            } catch {
              // ignore malformed messages
            }
          });

          ws.on('close', () => {
            this.clients.delete(ws);
          });

          ws.on('error', (err) => {
            this.emit('error', err);
            this.clients.delete(ws);
          });
        });

        this.wss.on('listening', () => resolve());
        this.wss.on('error', reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Connects to an existing Antigravity Mission Control WebSocket server.
   * Use this when Antigravity exposes its own server and Ruflo is the client.
   */
  connectToAntigravity(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);

      ws.on('open', () => {
        this.outboundClient = ws;
        resolve();
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as AntigravityAgentEvent;
          this.handleInboundEvent(msg);
        } catch {
          // ignore malformed
        }
      });

      ws.on('error', (err) => {
        reject(err);
      });

      ws.on('close', () => {
        this.outboundClient = null;
        this.emit('disconnected');
      });
    });
  }

  /**
   * Updates the state for a specific agent and broadcasts to all connected
   * Antigravity clients.
   */
  syncAgentState(agentId: string, state: AgentState): void {
    const merged: AgentState = {
      ...this.agentStates.get(agentId),
      ...state,
      agentId,
    };
    this.agentStates.set(agentId, merged);

    const eventType: AntigravityAgentEvent['type'] =
      state.status === 'running'
        ? 'agent:started'
        : state.status === 'completed'
          ? 'agent:completed'
          : state.status === 'failed'
            ? 'agent:failed'
            : 'swarm:updated';

    const event: AntigravityAgentEvent = {
      type: eventType,
      agentId,
      state: merged,
      timestamp: new Date(),
    };

    this.appendHistory(event);
    this.broadcast(event);
    this.emit('stateChanged', agentId, merged);
  }

  /**
   * Registers a handler to be called whenever Antigravity sends an agent
   * event back to Ruflo (bidirectional sync).
   */
  subscribeToAntigravityEvents(handler: (event: AntigravityAgentEvent) => void): () => void {
    const id = String(Date.now()) + Math.random().toString(36).slice(2);
    this.eventHandlers.set(id, handler);

    // Return unsubscribe function
    return () => {
      this.eventHandlers.delete(id);
    };
  }

  /**
   * Returns the current state for all tracked agents.
   */
  getSwarmSnapshot(): AgentState[] {
    return Array.from(this.agentStates.values());
  }

  /**
   * Returns the most recent N events from the history buffer.
   */
  getRecentEvents(limit = 50): AntigravityAgentEvent[] {
    return this.stateHistory.slice(-limit);
  }

  /**
   * Gracefully shuts down the WebSocket server and any outbound connection.
   */
  async stop(): Promise<void> {
    if (this.outboundClient) {
      this.outboundClient.close();
      this.outboundClient = null;
    }

    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
      this.wss = null;
    }

    this.clients.clear();
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private broadcast(event: AntigravityAgentEvent): void {
    const msg: MissionControlMessage = {
      protocol: 'ruflo-mission-control',
      version: '1.0',
      event,
    };
    const payload = JSON.stringify(msg);

    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }

    if (this.outboundClient?.readyState === WebSocket.OPEN) {
      this.outboundClient.send(payload);
    }
  }

  private handleInboundEvent(event: AntigravityAgentEvent): void {
    this.appendHistory(event);

    for (const handler of this.eventHandlers.values()) {
      try {
        handler(event);
      } catch {
        // isolate handler errors
      }
    }

    this.emit('antigravityEvent', event);
  }

  private appendHistory(event: AntigravityAgentEvent): void {
    this.stateHistory.push(event);
    if (this.stateHistory.length > this.options.maxHistorySize) {
      this.stateHistory.splice(0, this.stateHistory.length - this.options.maxHistorySize);
    }
  }
}
