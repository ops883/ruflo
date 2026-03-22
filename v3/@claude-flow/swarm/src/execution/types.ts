/**
 * Execution Engine Types
 * Types for subprocess management, agent execution, and process lifecycle.
 */

import type { ChildProcess } from 'node:child_process';

export interface SpawnOptions {
  /** Prompt to send to Claude via stdin */
  prompt: string;
  /** Working directory for the subprocess */
  cwd?: string;
  /** Model to use (haiku, sonnet, opus) */
  model?: 'haiku' | 'sonnet' | 'opus';
  /** Maximum execution time in ms */
  timeoutMs?: number;
  /** Maximum budget in USD */
  maxBudgetUsd?: number;
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Tools to allow (comma-separated) */
  allowedTools?: string;
  /** Output format (text, json, stream-json) */
  outputFormat?: 'text' | 'json' | 'stream-json';
  /** Session ID for continuation */
  sessionId?: string;
  /** System prompt to append */
  systemPrompt?: string;
}

export interface ManagedProcess {
  /** Unique process identifier */
  id: string;
  /** The underlying child process */
  process: ChildProcess;
  /** OS process ID */
  pid: number;
  /** Process status */
  status: 'spawning' | 'running' | 'completed' | 'failed' | 'killed';
  /** When the process was started */
  startedAt: Date;
  /** When the process ended */
  endedAt?: Date;
  /** Collected stdout */
  stdout: string;
  /** Collected stderr */
  stderr: string;
  /** Exit code */
  exitCode?: number;
  /** Promise that resolves when process completes */
  completion: Promise<ProcessResult>;
}

export interface ProcessResult {
  /** Whether the process completed successfully */
  success: boolean;
  /** Collected stdout output */
  output: string;
  /** Collected stderr output */
  error: string;
  /** Exit code (0 = success) */
  exitCode: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether the process was killed due to timeout */
  timedOut: boolean;
  /** Token usage if available from output */
  tokenUsage?: TokenUsage;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd?: number;
}

export interface AgentConfig {
  /** Agent type (coder, tester, reviewer, etc.) */
  type: string;
  /** Human-readable name */
  name: string;
  /** Working directory */
  cwd?: string;
  /** Model override */
  model?: 'haiku' | 'sonnet' | 'opus';
  /** System prompt for the agent */
  systemPrompt?: string;
  /** Maximum concurrent tasks */
  maxConcurrentTasks?: number;
  /** Timeout per task in ms (default: 300000 = 5min) */
  taskTimeoutMs?: number;
  /** Max budget per task in USD */
  maxBudgetPerTask?: number;
  /** Tools the agent is allowed to use */
  allowedTools?: string;
  /** Additional environment variables */
  env?: Record<string, string>;
}

export interface AgentHandle {
  /** Unique agent identifier */
  id: string;
  /** Agent configuration */
  config: AgentConfig;
  /** Current status */
  status: 'idle' | 'busy' | 'failed' | 'terminated';
  /** When the agent was created */
  createdAt: Date;
  /** Last activity timestamp */
  lastActivity: Date;
  /** Total tasks completed */
  tasksCompleted: number;
  /** Total tasks failed */
  tasksFailed: number;
  /** Execute a task on this agent */
  execute(task: TaskRequest): Promise<TaskResult>;
  /** Terminate this agent */
  terminate(): Promise<void>;
}

export interface TaskRequest {
  /** Task identifier */
  id: string;
  /** Description/prompt for the task */
  prompt: string;
  /** Task priority */
  priority?: 'critical' | 'high' | 'normal' | 'low';
  /** Timeout override in ms */
  timeoutMs?: number;
  /** Budget override in USD */
  maxBudgetUsd?: number;
  /** Additional context */
  context?: Record<string, unknown>;
}

export interface TaskResult {
  /** Task identifier */
  taskId: string;
  /** Agent that executed the task */
  agentId: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Output from the task */
  output: string;
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Token usage */
  tokenUsage?: TokenUsage;
  /** Whether it timed out */
  timedOut: boolean;
}

export interface ExecutionEngineConfig {
  /** Maximum concurrent agents */
  maxConcurrentAgents: number;
  /** Default task timeout in ms */
  defaultTimeoutMs: number;
  /** Default model */
  defaultModel: 'haiku' | 'sonnet' | 'opus';
  /** Path to claude executable */
  claudeExecutable: string;
  /** Working directory */
  cwd: string;
  /** Health check interval in ms */
  healthCheckIntervalMs: number;
  /** Maximum retries per task */
  maxRetries: number;
  /** Default budget per task in USD */
  defaultBudgetUsd?: number;
}

export interface ExecutionEngineMetrics {
  activeAgents: number;
  idleAgents: number;
  busyAgents: number;
  failedAgents: number;
  totalSpawned: number;
  totalTerminated: number;
  totalTasksExecuted: number;
  totalTasksFailed: number;
  averageTaskDurationMs: number;
  totalTokensUsed: number;
}
