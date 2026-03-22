/**
 * Execution Engine
 * Provides real subprocess execution for v3 swarm orchestration.
 */

export { ProcessSpawner } from './process-spawner.js';
export { AgentExecutor } from './agent-executor.js';
export { SwarmExecutionBridge } from './swarm-execution-bridge.js';
export type { BridgeConfig, TaskAssignmentEvent } from './swarm-execution-bridge.js';
export { BudgetManager } from './budget-manager.js';
export type { BudgetConfig, BudgetStatus, AgentBudgetStatus } from './budget-manager.js';
export type {
  SpawnOptions,
  ManagedProcess,
  ProcessResult,
  TokenUsage,
  AgentConfig,
  AgentHandle,
  TaskRequest,
  TaskResult,
  ExecutionEngineConfig,
  ExecutionEngineMetrics,
} from './types.js';
