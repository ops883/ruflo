/**
 * Swarm Execution Bridge
 * Connects the UnifiedSwarmCoordinator to the AgentExecutor.
 * Listens for task assignments from the coordinator and dispatches them
 * to real Claude subprocesses via the AgentExecutor.
 *
 * This is the missing link that makes v3 swarm orchestration actually execute work.
 */

import { EventEmitter } from 'node:events';
import { AgentExecutor } from './agent-executor.js';
import type {
  AgentConfig,
  AgentHandle,
  TaskRequest,
  TaskResult,
  ExecutionEngineConfig,
  ExecutionEngineMetrics,
} from './types.js';

export interface BridgeConfig {
  /** Execution engine configuration */
  execution?: Partial<ExecutionEngineConfig>;
  /** Whether to auto-spawn agents when tasks are assigned */
  autoSpawn?: boolean;
  /** Default agent configs by type */
  agentDefaults?: Record<string, Partial<AgentConfig>>;
}

export interface TaskAssignmentEvent {
  taskId: string;
  agentType: string;
  agentName?: string;
  prompt: string;
  priority?: 'critical' | 'high' | 'normal' | 'low';
  timeoutMs?: number;
  context?: Record<string, unknown>;
}

/**
 * Bridge between swarm coordination (metadata) and actual execution (processes).
 *
 * Usage:
 * ```typescript
 * const bridge = new SwarmExecutionBridge({ autoSpawn: true });
 * await bridge.initialize();
 *
 * // Dispatch a task — spawns agent if needed, executes, returns result
 * const result = await bridge.dispatchTask({
 *   taskId: 'task-1',
 *   agentType: 'coder',
 *   prompt: 'Implement the auth module',
 * });
 * ```
 */
export class SwarmExecutionBridge extends EventEmitter {
  private readonly executor: AgentExecutor;
  private readonly config: BridgeConfig;
  private readonly agentTypeMap = new Map<string, string>(); // agentType -> agentId
  private initialized = false;

  constructor(config: BridgeConfig = {}) {
    super();
    this.config = {
      autoSpawn: true,
      ...config,
    };
    this.executor = new AgentExecutor(config.execution);
  }

  /**
   * Initialize the bridge and its execution engine.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.executor.initialize();
    this.initialized = true;
    this.emit('initialized');
  }

  /**
   * Shutdown the bridge and all agents.
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;
    await this.executor.shutdown();
    this.agentTypeMap.clear();
    this.initialized = false;
    this.emit('shutdown');
  }

  /**
   * Dispatch a task for execution.
   * If autoSpawn is enabled, spawns an agent of the requested type if none exists.
   * Otherwise, requires a pre-spawned agent of the right type.
   */
  async dispatchTask(event: TaskAssignmentEvent): Promise<TaskResult> {
    if (!this.initialized) {
      throw new Error('SwarmExecutionBridge not initialized. Call initialize() first.');
    }

    this.emit('task:dispatching', event);

    // Find or create an agent for this task
    const agent = await this.getOrCreateAgent(event.agentType, event.agentName);

    const taskRequest: TaskRequest = {
      id: event.taskId,
      prompt: event.prompt,
      priority: event.priority,
      timeoutMs: event.timeoutMs,
      context: event.context,
    };

    try {
      const result = await agent.execute(taskRequest);
      this.emit('task:completed', result);
      return result;
    } catch (err) {
      const failResult: TaskResult = {
        taskId: event.taskId,
        agentId: agent.id,
        success: false,
        output: '',
        error: err instanceof Error ? err.message : String(err),
        durationMs: 0,
        timedOut: false,
      };
      this.emit('task:failed', failResult);
      return failResult;
    }
  }

  /**
   * Dispatch multiple tasks in parallel.
   */
  async dispatchParallel(events: TaskAssignmentEvent[]): Promise<TaskResult[]> {
    return Promise.all(events.map((e) => this.dispatchTask(e)));
  }

  /**
   * Pre-spawn an agent of the given type.
   */
  async spawnAgent(config: AgentConfig): Promise<AgentHandle> {
    const agent = await this.executor.spawn(config);
    this.agentTypeMap.set(config.type, agent.id);
    this.emit('agent:spawned', { id: agent.id, type: config.type });
    return agent;
  }

  /**
   * Terminate a specific agent.
   */
  async terminateAgent(agentId: string): Promise<void> {
    await this.executor.terminateAgent(agentId);
    // Remove from type map
    for (const [type, id] of this.agentTypeMap) {
      if (id === agentId) {
        this.agentTypeMap.delete(type);
        break;
      }
    }
  }

  /**
   * Get execution metrics.
   */
  getMetrics(): ExecutionEngineMetrics {
    return this.executor.getMetrics();
  }

  /**
   * List all active agents.
   */
  listAgents(): AgentHandle[] {
    return this.executor.listAgents();
  }

  /**
   * Get the underlying executor (for advanced use).
   */
  getExecutor(): AgentExecutor {
    return this.executor;
  }

  private async getOrCreateAgent(
    agentType: string,
    agentName?: string,
  ): Promise<AgentHandle> {
    // First, try to find an existing idle agent of this type
    const existingAgent = this.executor.findIdleAgent(agentType);
    if (existingAgent) return existingAgent;

    // Auto-spawn if enabled
    if (!this.config.autoSpawn) {
      throw new Error(
        `No idle agent of type "${agentType}" available and autoSpawn is disabled`,
      );
    }

    const defaults = this.config.agentDefaults?.[agentType] ?? {};
    const config: AgentConfig = {
      type: agentType,
      name: agentName ?? `${agentType}-${Date.now()}`,
      ...defaults,
    };

    return this.spawnAgent(config);
  }
}
