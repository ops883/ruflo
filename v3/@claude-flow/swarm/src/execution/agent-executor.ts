/**
 * Agent Executor
 * Manages agent lifecycle and task execution through Claude subprocesses.
 * Ported from v2's ClaudeCodeInterface with v3 DDD architecture.
 *
 * Features:
 * - Agent pool management (idle/busy/failed)
 * - Concurrent task execution with limits
 * - Health checks and agent recycling
 * - Metrics collection
 */

import { EventEmitter } from 'node:events';
import { ProcessSpawner } from './process-spawner.js';
import type {
  AgentConfig,
  AgentHandle,
  TaskRequest,
  TaskResult,
  ExecutionEngineConfig,
  ExecutionEngineMetrics,
} from './types.js';

const DEFAULT_CONFIG: ExecutionEngineConfig = {
  maxConcurrentAgents: 8,
  defaultTimeoutMs: 300_000,
  defaultModel: 'sonnet',
  claudeExecutable: 'claude',
  cwd: process.cwd(),
  healthCheckIntervalMs: 30_000,
  maxRetries: 2,
};

let agentCounter = 0;

export class AgentExecutor extends EventEmitter {
  private readonly config: ExecutionEngineConfig;
  private readonly spawner: ProcessSpawner;
  private readonly agents = new Map<string, AgentHandleImpl>();
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private totalTasksExecuted = 0;
  private totalTasksFailed = 0;
  private totalTaskDurationMs = 0;
  private totalTokensUsed = 0;
  private totalAgentsSpawned = 0;
  private totalAgentsTerminated = 0;

  constructor(config: Partial<ExecutionEngineConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.spawner = new ProcessSpawner(this.config.claudeExecutable);
  }

  /**
   * Initialize the executor and start health checks.
   */
  async initialize(): Promise<void> {
    this.healthCheckTimer = setInterval(
      () => this.runHealthChecks(),
      this.config.healthCheckIntervalMs,
    );
    this.emit('initialized');
  }

  /**
   * Shutdown: terminate all agents and stop health checks.
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    const agents = Array.from(this.agents.values());
    await Promise.allSettled(agents.map((a) => a.terminate()));
    await this.spawner.killAll('shutdown');

    this.emit('shutdown');
  }

  /**
   * Spawn a new agent with the given configuration.
   * Returns an AgentHandle that can execute tasks.
   */
  async spawn(config: AgentConfig): Promise<AgentHandle> {
    if (this.agents.size >= this.config.maxConcurrentAgents) {
      throw new Error(
        `Maximum concurrent agents reached (${this.config.maxConcurrentAgents}). ` +
        `Active: ${this.agents.size}`,
      );
    }

    const id = `agent-${++agentCounter}-${Date.now()}`;
    const handle = new AgentHandleImpl(id, config, this.spawner, this.config, this);
    this.agents.set(id, handle);
    this.totalAgentsSpawned++;

    this.emit('agent:spawned', { id, type: config.type, name: config.name });
    return handle;
  }

  /**
   * Get an agent by ID.
   */
  getAgent(id: string): AgentHandle | undefined {
    return this.agents.get(id);
  }

  /**
   * List all active agents.
   */
  listAgents(): AgentHandle[] {
    return Array.from(this.agents.values());
  }

  /**
   * Find an idle agent of the given type, or undefined.
   */
  findIdleAgent(type?: string): AgentHandle | undefined {
    for (const agent of this.agents.values()) {
      if (agent.status === 'idle' && (!type || agent.config.type === type)) {
        return agent;
      }
    }
    return undefined;
  }

  /**
   * Terminate a specific agent.
   */
  async terminateAgent(id: string): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) return;

    await agent.terminate();
    this.agents.delete(id);
    this.totalAgentsTerminated++;

    this.emit('agent:terminated', { id });
  }

  /**
   * Get execution metrics.
   */
  getMetrics(): ExecutionEngineMetrics {
    let idle = 0, busy = 0, failed = 0;
    for (const agent of this.agents.values()) {
      switch (agent.status) {
        case 'idle': idle++; break;
        case 'busy': busy++; break;
        case 'failed': failed++; break;
      }
    }

    return {
      activeAgents: this.agents.size,
      idleAgents: idle,
      busyAgents: busy,
      failedAgents: failed,
      totalSpawned: this.totalAgentsSpawned,
      totalTerminated: this.totalAgentsTerminated,
      totalTasksExecuted: this.totalTasksExecuted,
      totalTasksFailed: this.totalTasksFailed,
      averageTaskDurationMs: this.totalTasksExecuted > 0
        ? this.totalTaskDurationMs / this.totalTasksExecuted
        : 0,
      totalTokensUsed: this.totalTokensUsed,
    };
  }

  /** Called by AgentHandleImpl when a task completes */
  _recordTaskCompletion(result: TaskResult): void {
    this.totalTasksExecuted++;
    this.totalTaskDurationMs += result.durationMs;
    if (!result.success) this.totalTasksFailed++;
    if (result.tokenUsage) this.totalTokensUsed += result.tokenUsage.totalTokens;
  }

  /** Called by AgentHandleImpl when agent fails permanently */
  _recordAgentFailure(id: string): void {
    this.agents.delete(id);
    this.totalAgentsTerminated++;
  }

  private runHealthChecks(): void {
    for (const [id, agent] of this.agents) {
      if (agent.status === 'terminated') {
        this.agents.delete(id);
        this.totalAgentsTerminated++;
        continue;
      }

      // Check for agents stuck in busy state too long
      if (agent.status === 'busy') {
        const idleTime = Date.now() - agent.lastActivity.getTime();
        const maxIdle = (agent.config.taskTimeoutMs ?? this.config.defaultTimeoutMs) * 2;
        if (idleTime > maxIdle) {
          this.emit('agent:stuck', { id, idleTimeMs: idleTime });
        }
      }
    }
  }
}

/**
 * Internal implementation of AgentHandle.
 * Each agent represents a logical unit that spawns Claude subprocesses for tasks.
 */
class AgentHandleImpl implements AgentHandle {
  readonly id: string;
  readonly config: AgentConfig;
  status: 'idle' | 'busy' | 'failed' | 'terminated' = 'idle';
  readonly createdAt = new Date();
  lastActivity = new Date();
  tasksCompleted = 0;
  tasksFailed = 0;

  private readonly spawner: ProcessSpawner;
  private readonly engineConfig: ExecutionEngineConfig;
  private readonly executor: AgentExecutor;

  constructor(
    id: string,
    config: AgentConfig,
    spawner: ProcessSpawner,
    engineConfig: ExecutionEngineConfig,
    executor: AgentExecutor,
  ) {
    this.id = id;
    this.config = config;
    this.spawner = spawner;
    this.engineConfig = engineConfig;
    this.executor = executor;
  }

  /**
   * Execute a task by spawning a Claude subprocess.
   * The agent handles one task at a time (status goes idle -> busy -> idle).
   */
  async execute(task: TaskRequest): Promise<TaskResult> {
    if (this.status === 'terminated') {
      throw new Error(`Agent ${this.id} is terminated`);
    }
    if (this.status === 'busy') {
      throw new Error(`Agent ${this.id} is busy`);
    }

    this.status = 'busy';
    this.lastActivity = new Date();

    let retries = 0;
    const maxRetries = this.engineConfig.maxRetries;

    while (retries <= maxRetries) {
      try {
        const result = await this.executeOnce(task);
        this.executor._recordTaskCompletion(result);

        if (result.success) {
          this.tasksCompleted++;
          this.status = 'idle';
          this.lastActivity = new Date();
          return result;
        }

        // Failed but maybe retryable
        if (retries < maxRetries && !result.timedOut) {
          retries++;
          continue;
        }

        this.tasksFailed++;
        this.status = 'idle';
        this.lastActivity = new Date();
        return result;
      } catch (err) {
        if (retries < maxRetries) {
          retries++;
          continue;
        }

        this.tasksFailed++;
        this.status = 'failed';
        this.executor._recordAgentFailure(this.id);

        return {
          taskId: task.id,
          agentId: this.id,
          success: false,
          output: '',
          error: err instanceof Error ? err.message : String(err),
          durationMs: 0,
          timedOut: false,
        };
      }
    }

    // Should not reach here, but TypeScript needs it
    throw new Error('Unexpected: exhausted retries without returning');
  }

  async terminate(): Promise<void> {
    this.status = 'terminated';
  }

  private async executeOnce(task: TaskRequest): Promise<TaskResult> {
    const startTime = Date.now();

    const managed = this.spawner.spawn({
      prompt: this.buildPrompt(task),
      cwd: this.config.cwd ?? this.engineConfig.cwd,
      model: this.config.model ?? this.engineConfig.defaultModel,
      timeoutMs: task.timeoutMs ?? this.config.taskTimeoutMs ?? this.engineConfig.defaultTimeoutMs,
      maxBudgetUsd: task.maxBudgetUsd ?? this.config.maxBudgetPerTask ?? this.engineConfig.defaultBudgetUsd,
      env: this.config.env,
      allowedTools: this.config.allowedTools,
    });

    const processResult = await managed.completion;

    return {
      taskId: task.id,
      agentId: this.id,
      success: processResult.success,
      output: processResult.output,
      error: processResult.error || undefined,
      durationMs: Date.now() - startTime,
      tokenUsage: processResult.tokenUsage,
      timedOut: processResult.timedOut,
    };
  }

  private buildPrompt(task: TaskRequest): string {
    const parts: string[] = [];

    if (this.config.systemPrompt) {
      parts.push(this.config.systemPrompt);
      parts.push('');
    }

    parts.push(`You are a ${this.config.type} agent named "${this.config.name}".`);
    parts.push(`Task ID: ${task.id}`);
    parts.push(`Priority: ${task.priority ?? 'normal'}`);
    parts.push('');
    parts.push(task.prompt);

    if (task.context && Object.keys(task.context).length > 0) {
      parts.push('');
      parts.push('Additional context:');
      parts.push(JSON.stringify(task.context, null, 2));
    }

    return parts.join('\n');
  }
}
