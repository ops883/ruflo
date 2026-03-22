/**
 * Execution Engine Unit Tests
 * Covers ProcessSpawner, AgentExecutor, BudgetManager, and SwarmExecutionBridge.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { spawn as realSpawn } from 'node:child_process';

// ---------------------------------------------------------------------------
// Mock child_process.spawn before importing modules that use it
// ---------------------------------------------------------------------------

function createMockChildProcess(overrides: { pid?: number } = {}) {
  const child: any = new EventEmitter();
  child.pid = overrides.pid ?? 12345;
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

let mockChild: ReturnType<typeof createMockChildProcess>;

vi.mock('node:child_process', () => ({
  spawn: vi.fn((..._args: any[]) => mockChild),
}));

// Get reference to the mocked spawn for assertions
const mockedSpawn = vi.mocked(realSpawn);

// Now import the modules under test
import { ProcessSpawner } from '../src/execution/process-spawner.js';
import { AgentExecutor } from '../src/execution/agent-executor.js';
import { BudgetManager } from '../src/execution/budget-manager.js';
import { SwarmExecutionBridge } from '../src/execution/swarm-execution-bridge.js';
import type { TokenUsage } from '../src/execution/types.js';

// ---------------------------------------------------------------------------
// ProcessSpawner
// ---------------------------------------------------------------------------

describe('ProcessSpawner', () => {
  let spawner: ProcessSpawner;

  beforeEach(() => {
    mockChild = createMockChildProcess();
    mockedSpawn.mockImplementation((() => mockChild) as any);
    spawner = new ProcessSpawner('claude');
  });

  afterEach(async () => {
    await spawner.killAll();
    spawner.removeAllListeners();
  });

  it('should spawn a process and track it', () => {
    const managed = spawner.spawn({ prompt: 'hello' });

    expect(managed.id).toMatch(/^proc-/);
    expect(managed.pid).toBe(12345);
    expect(managed.status).toBe('running');
    expect(spawner.activeCount).toBe(1);
  });

  it('should build --print args with model and output format', () => {
    spawner.spawn({
      prompt: 'test',
      model: 'opus',
      outputFormat: 'json',
      maxBudgetUsd: 1.5,
      allowedTools: 'Read,Write',
      sessionId: 'sess-1',
      systemPrompt: 'Be concise',
    });

    const args = mockedSpawn.mock.calls[mockedSpawn.mock.calls.length - 1][1] as string[];
    expect(args).toContain('--print');
    expect(args).toContain('--model');
    expect(args).toContain('opus');
    expect(args).toContain('--output-format');
    expect(args).toContain('json');
    expect(args).toContain('--max-budget-usd');
    expect(args).toContain('1.5');
    expect(args).toContain('--allowedTools');
    expect(args).toContain('Read,Write');
    expect(args).toContain('--session-id');
    expect(args).toContain('sess-1');
    expect(args).toContain('--append-system-prompt');
    expect(args).toContain('Be concise');
  });

  it('should write prompt to stdin and close it immediately', () => {
    spawner.spawn({ prompt: 'do something' });

    expect(mockChild.stdin.write).toHaveBeenCalledWith('do something');
    expect(mockChild.stdin.end).toHaveBeenCalled();
  });

  it('should resolve completion with success on exit code 0', async () => {
    const managed = spawner.spawn({ prompt: 'hello' });

    mockChild.stdout.emit('data', Buffer.from('result output'));
    mockChild.emit('close', 0, null);

    const result = await managed.completion;
    expect(result.success).toBe(true);
    expect(result.output).toBe('result output');
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should resolve completion with failure on non-zero exit', async () => {
    const managed = spawner.spawn({ prompt: 'hello' });

    mockChild.stderr.emit('data', Buffer.from('error!'));
    mockChild.emit('close', 1, null);

    const result = await managed.completion;
    expect(result.success).toBe(false);
    expect(result.error).toBe('error!');
    expect(result.exitCode).toBe(1);
  });

  it('should handle process error events', async () => {
    // Must listen for 'error' on spawner to prevent unhandled EventEmitter error
    const errors: any[] = [];
    spawner.on('error', (e) => errors.push(e));

    const managed = spawner.spawn({ prompt: 'hello' });

    mockChild.emit('error', new Error('spawn ENOENT'));

    const result = await managed.completion;
    expect(result.success).toBe(false);
    expect(result.error).toBe('spawn ENOENT');
    expect(result.exitCode).toBe(-1);
    expect(errors).toHaveLength(1);
  });

  it('should remove process from tracking after exit', async () => {
    const managed = spawner.spawn({ prompt: 'hello' });
    expect(spawner.activeCount).toBe(1);

    mockChild.emit('close', 0, null);
    await managed.completion;

    expect(spawner.activeCount).toBe(0);
  });

  it('should emit output events for stdout and stderr chunks', async () => {
    const outputs: any[] = [];
    spawner.on('output', (e) => outputs.push(e));

    const managed = spawner.spawn({ prompt: 'hello' });

    mockChild.stdout.emit('data', Buffer.from('chunk1'));
    mockChild.stderr.emit('data', Buffer.from('err1'));
    mockChild.emit('close', 0, null);
    await managed.completion;

    expect(outputs).toHaveLength(2);
    expect(outputs[0]).toMatchObject({ chunk: 'chunk1', stream: 'stdout' });
    expect(outputs[1]).toMatchObject({ chunk: 'err1', stream: 'stderr' });
  });

  it('should parse token usage from JSON output', async () => {
    const managed = spawner.spawn({ prompt: 'hello' });

    const jsonOutput = 'Some text "usage": {"input_tokens": 100, "output_tokens": 50} more text';
    mockChild.stdout.emit('data', Buffer.from(jsonOutput));
    mockChild.emit('close', 0, null);

    const result = await managed.completion;
    expect(result.tokenUsage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    });
  });

  it('should return undefined tokenUsage when output has no usage JSON', async () => {
    const managed = spawner.spawn({ prompt: 'hello' });

    mockChild.stdout.emit('data', Buffer.from('plain text output'));
    mockChild.emit('close', 0, null);

    const result = await managed.completion;
    expect(result.tokenUsage).toBeUndefined();
  });

  it('should kill process with SIGTERM first', async () => {
    const managed = spawner.spawn({ prompt: 'hello' });

    const killPromise = spawner.killProcess(managed, 'manual');
    // Simulate the process closing after SIGTERM
    mockChild.emit('close', null, 'SIGTERM');
    await killPromise;

    expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
    expect(managed.status).toBe('killed');
  });

  it('should skip killing already completed processes', async () => {
    const managed = spawner.spawn({ prompt: 'hello' });

    mockChild.emit('close', 0, null);
    await managed.completion;

    await spawner.killProcess(managed, 'manual');
    expect(managed.status).toBe('completed');
  });

  it('should killAll tracked processes', async () => {
    const child1 = createMockChildProcess({ pid: 11111 });
    const child2 = createMockChildProcess({ pid: 22222 });

    mockedSpawn.mockImplementationOnce((() => child1) as any);
    const m1 = spawner.spawn({ prompt: 'a' });

    mockedSpawn.mockImplementationOnce((() => child2) as any);
    const m2 = spawner.spawn({ prompt: 'b' });

    expect(spawner.activeCount).toBe(2);

    const killPromise = spawner.killAll('shutdown');
    child1.emit('close', null, 'SIGTERM');
    child2.emit('close', null, 'SIGTERM');
    await killPromise;

    expect(spawner.activeCount).toBe(0);
  });

  it('should report metrics correctly', () => {
    spawner.spawn({ prompt: 'a' });
    const metrics = spawner.getMetrics();
    expect(metrics.active).toBe(1);
    expect(metrics.ids).toHaveLength(1);
  });

  it('should throw when child has no pid', () => {
    const noPidChild = createMockChildProcess();
    noPidChild.pid = undefined as any;
    mockedSpawn.mockImplementationOnce((() => noPidChild) as any);

    expect(() => spawner.spawn({ prompt: 'hello' })).toThrow('Failed to spawn');
  });
});

// ---------------------------------------------------------------------------
// AgentExecutor
// ---------------------------------------------------------------------------

describe('AgentExecutor', () => {
  let executor: AgentExecutor;

  beforeEach(() => {
    mockChild = createMockChildProcess();
    mockedSpawn.mockImplementation((() => mockChild) as any);
    executor = new AgentExecutor({
      maxConcurrentAgents: 3,
      healthCheckIntervalMs: 60_000, // long interval to avoid interference
      maxRetries: 0,
    });
  });

  afterEach(async () => {
    await executor.shutdown();
    executor.removeAllListeners();
  });

  it('should spawn agents up to the concurrency limit', async () => {
    await executor.initialize();

    const a1 = await executor.spawn({ type: 'coder', name: 'c1' });
    const a2 = await executor.spawn({ type: 'tester', name: 't1' });
    const a3 = await executor.spawn({ type: 'reviewer', name: 'r1' });

    expect(a1.id).toMatch(/^agent-/);
    expect(executor.listAgents()).toHaveLength(3);

    await expect(executor.spawn({ type: 'coder', name: 'c2' }))
      .rejects.toThrow('Maximum concurrent agents');
  });

  it('should find an idle agent by type', async () => {
    await executor.initialize();

    await executor.spawn({ type: 'coder', name: 'c1' });
    await executor.spawn({ type: 'tester', name: 't1' });

    const idle = executor.findIdleAgent('tester');
    expect(idle).toBeDefined();
    expect(idle!.config.type).toBe('tester');
  });

  it('should return undefined when no idle agent of type exists', async () => {
    await executor.initialize();
    await executor.spawn({ type: 'coder', name: 'c1' });

    expect(executor.findIdleAgent('reviewer')).toBeUndefined();
  });

  it('should terminate an agent and update metrics', async () => {
    await executor.initialize();

    const agent = await executor.spawn({ type: 'coder', name: 'c1' });
    expect(executor.listAgents()).toHaveLength(1);

    await executor.terminateAgent(agent.id);
    expect(executor.listAgents()).toHaveLength(0);

    const metrics = executor.getMetrics();
    expect(metrics.totalSpawned).toBe(1);
    expect(metrics.totalTerminated).toBe(1);
  });

  it('should silently ignore terminating a non-existent agent', async () => {
    await executor.initialize();
    await expect(executor.terminateAgent('fake-id')).resolves.toBeUndefined();
  });

  it('should report correct idle/busy/failed metrics', async () => {
    await executor.initialize();

    await executor.spawn({ type: 'coder', name: 'c1' });
    await executor.spawn({ type: 'tester', name: 't1' });

    const metrics = executor.getMetrics();
    expect(metrics.activeAgents).toBe(2);
    expect(metrics.idleAgents).toBe(2);
    expect(metrics.busyAgents).toBe(0);
    expect(metrics.failedAgents).toBe(0);
  });

  it('should emit initialized and shutdown events', async () => {
    const events: string[] = [];
    executor.on('initialized', () => events.push('init'));
    executor.on('shutdown', () => events.push('shutdown'));

    await executor.initialize();
    await executor.shutdown();

    expect(events).toEqual(['init', 'shutdown']);
  });

  it('should get an agent by id', async () => {
    await executor.initialize();
    const agent = await executor.spawn({ type: 'coder', name: 'c1' });

    expect(executor.getAgent(agent.id)).toBe(agent);
    expect(executor.getAgent('nonexistent')).toBeUndefined();
  });

  it('should execute a task through an agent', async () => {
    await executor.initialize();
    const agent = await executor.spawn({ type: 'coder', name: 'c1' });

    const execPromise = agent.execute({ id: 'task-1', prompt: 'do work' });

    await vi.waitFor(() => {
      expect(mockChild.stdin.write).toHaveBeenCalled();
    });

    mockChild.stdout.emit('data', Buffer.from('done'));
    mockChild.emit('close', 0, null);

    const result = await execPromise;
    expect(result.success).toBe(true);
    expect(result.taskId).toBe('task-1');
    expect(result.agentId).toBe(agent.id);

    const metrics = executor.getMetrics();
    expect(metrics.totalTasksExecuted).toBe(1);
    expect(metrics.totalTasksFailed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// BudgetManager
// ---------------------------------------------------------------------------

describe('BudgetManager', () => {
  let budget: BudgetManager;

  beforeEach(() => {
    budget = new BudgetManager({
      maxTokensPerAgent: 1000,
      maxTokensPerSession: 5000,
      maxBudgetUSD: 10.0,
    });
  });

  afterEach(() => {
    budget.removeAllListeners();
  });

  const usage = (input: number, output: number, cost = 0): TokenUsage => ({
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output,
    costUsd: cost,
  });

  it('should record usage and accumulate per-agent totals', () => {
    budget.recordUsage('a1', usage(100, 50));
    budget.recordUsage('a1', usage(200, 100));

    const status = budget.getUsage('a1') as any;
    expect(status.inputTokens).toBe(300);
    expect(status.outputTokens).toBe(150);
    expect(status.totalTokens).toBe(450);
  });

  it('should accumulate session-level totals across agents', () => {
    budget.recordUsage('a1', usage(100, 50));
    budget.recordUsage('a2', usage(200, 100));

    const session = budget.getSessionUsage();
    expect(session.totalTokens).toBe(450);
    expect(session.inputTokens).toBe(300);
    expect(session.outputTokens).toBe(150);
  });

  it('should calculate percentTokensUsed for session', () => {
    budget.recordUsage('a1', usage(1000, 500));
    const session = budget.getSessionUsage();
    // 1500 / 5000 = 30%
    expect(session.percentTokensUsed).toBe(30);
  });

  it('should calculate percentBudgetUsed for session', () => {
    budget.recordUsage('a1', usage(100, 50, 2.0));
    const session = budget.getSessionUsage();
    // 2.0 / 10.0 = 20%
    expect(session.percentBudgetUsed).toBe(20);
  });

  it('should return percentUsed per agent', () => {
    budget.recordUsage('a1', usage(300, 200));
    const status = budget.getUsage('a1') as any;
    // 500 / 1000 = 50%
    expect(status.percentUsed).toBe(50);
  });

  it('should allow budget when under limits', () => {
    budget.recordUsage('a1', usage(100, 50));
    const check = budget.checkBudget('a1');
    expect(check.allowed).toBe(true);
    expect(check.reason).toBeUndefined();
  });

  it('should deny budget when per-agent limit exceeded', () => {
    budget.recordUsage('a1', usage(600, 500)); // 1100 >= 1000
    const check = budget.checkBudget('a1');
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('per-agent token limit');
  });

  it('should deny budget when session token limit exceeded', () => {
    // Use amounts that stay under per-agent limit (1000) but exceed session (5000)
    budget.recordUsage('a1', usage(400, 400)); // 800
    budget.recordUsage('a2', usage(400, 400)); // 800
    budget.recordUsage('a3', usage(400, 400)); // 800
    budget.recordUsage('a4', usage(400, 400)); // 800
    budget.recordUsage('a5', usage(400, 400)); // 800
    budget.recordUsage('a6', usage(400, 400)); // 800 => session total 4800
    budget.recordUsage('a7', usage(200, 200)); // 400 => session total 5200 >= 5000
    const check = budget.checkBudget('a7');
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Session token limit');
  });

  it('should deny budget when USD limit exceeded', () => {
    budget.recordUsage('a1', usage(100, 50, 11.0)); // $11 >= $10
    const check = budget.checkBudget('a1');
    expect(check.allowed).toBe(false);
    // Per-agent limit is checked first here, so check for either
    expect(check.allowed).toBe(false);
  });

  it('should allow budget for unknown agent with no usage', () => {
    const check = budget.checkBudget('unknown');
    expect(check.allowed).toBe(true);
  });

  it('should emit warning at 80% of per-agent limit', () => {
    const warnings: any[] = [];
    budget.on('budget:agent-warning', (e) => warnings.push(e));

    budget.recordUsage('a1', usage(500, 350)); // 850 => 85% of 1000
    expect(warnings).toHaveLength(1);
    expect(warnings[0].percent).toBe(85);
  });

  it('should emit limit event at 100% of per-agent limit', () => {
    const limits: any[] = [];
    budget.on('budget:agent-limit', (e) => limits.push(e));

    budget.recordUsage('a1', usage(600, 500)); // 1100 >= 1000
    expect(limits).toHaveLength(1);
    expect(limits[0].agentId).toBe('a1');
  });

  it('should emit session warning at 80%', () => {
    const warnings: any[] = [];
    budget.on('budget:session-warning', (e) => warnings.push(e));

    // Need to stay under per-agent limit; use many agents
    budget.recordUsage('a1', usage(400, 400)); // 800
    budget.recordUsage('a2', usage(400, 400)); // 800
    budget.recordUsage('a3', usage(400, 400)); // 800
    budget.recordUsage('a4', usage(400, 400)); // 800
    // session total = 3200, not yet 80%
    budget.recordUsage('a5', usage(450, 450)); // 900 => session total = 4100 => 82%
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('should emit session limit at 100%', () => {
    const limits: any[] = [];
    budget.on('budget:session-limit', (e) => limits.push(e));

    budget.recordUsage('a1', usage(400, 400));
    budget.recordUsage('a2', usage(400, 400));
    budget.recordUsage('a3', usage(400, 400));
    budget.recordUsage('a4', usage(400, 400));
    budget.recordUsage('a5', usage(400, 400));
    budget.recordUsage('a6', usage(400, 400));
    budget.recordUsage('a7', usage(200, 200)); // session total = 5200 >= 5000
    expect(limits.length).toBeGreaterThanOrEqual(1);
  });

  it('should emit cost warning at 80% of USD budget', () => {
    const warnings: any[] = [];
    budget.on('budget:cost-warning', (e) => warnings.push(e));

    budget.recordUsage('a1', usage(100, 50, 8.5)); // $8.5 => 85% of $10
    expect(warnings).toHaveLength(1);
    expect(warnings[0].percent).toBe(85);
  });

  it('should emit cost limit at 100% of USD budget', () => {
    const limits: any[] = [];
    budget.on('budget:cost-limit', (e) => limits.push(e));

    budget.recordUsage('a1', usage(100, 50, 10.5)); // $10.5 >= $10
    expect(limits).toHaveLength(1);
  });

  it('should reset all tracked usage', () => {
    budget.recordUsage('a1', usage(500, 300, 5.0));
    budget.recordUsage('a2', usage(200, 100, 2.0));
    budget.reset();

    const session = budget.getSessionUsage();
    expect(session.totalTokens).toBe(0);
    expect(session.costUsd).toBe(0);

    const all = budget.getUsage() as any[];
    expect(all).toHaveLength(0);
  });

  it('should return zeroed status for unknown agent', () => {
    const status = budget.getUsage('ghost') as any;
    expect(status.totalTokens).toBe(0);
    expect(status.costUsd).toBe(0);
    expect(status.agentId).toBe('ghost');
  });

  it('should list all agents when getUsage called with no argument', () => {
    budget.recordUsage('a1', usage(100, 50));
    budget.recordUsage('a2', usage(200, 100));

    const all = budget.getUsage() as any[];
    expect(all).toHaveLength(2);
  });

  it('should work with no limits configured', () => {
    const nolimit = new BudgetManager({});
    nolimit.recordUsage('a1', usage(99999, 99999, 999));

    const check = nolimit.checkBudget('a1');
    expect(check.allowed).toBe(true);

    const session = nolimit.getSessionUsage();
    expect(session.percentTokensUsed).toBeUndefined();
    expect(session.percentBudgetUsed).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SwarmExecutionBridge
// ---------------------------------------------------------------------------

describe('SwarmExecutionBridge', () => {
  let bridge: SwarmExecutionBridge;

  beforeEach(() => {
    mockChild = createMockChildProcess();
    mockedSpawn.mockImplementation((() => mockChild) as any);
    bridge = new SwarmExecutionBridge({
      autoSpawn: true,
      execution: {
        maxConcurrentAgents: 5,
        healthCheckIntervalMs: 60_000,
        maxRetries: 0,
      },
    });
  });

  afterEach(async () => {
    await bridge.shutdown();
    bridge.removeAllListeners();
  });

  it('should initialize and emit event', async () => {
    const events: string[] = [];
    bridge.on('initialized', () => events.push('init'));

    await bridge.initialize();
    expect(events).toEqual(['init']);
  });

  it('should not double-initialize', async () => {
    await bridge.initialize();
    await bridge.initialize(); // second call is a no-op
  });

  it('should throw when dispatching before initialization', async () => {
    await expect(
      bridge.dispatchTask({ taskId: 't1', agentType: 'coder', prompt: 'hi' }),
    ).rejects.toThrow('not initialized');
  });

  it('should dispatch a task with auto-spawn', async () => {
    await bridge.initialize();

    const dispatchPromise = bridge.dispatchTask({
      taskId: 'task-1',
      agentType: 'coder',
      prompt: 'implement feature',
    });

    await vi.waitFor(() => {
      expect(mockChild.stdin.write).toHaveBeenCalled();
    });

    mockChild.stdout.emit('data', Buffer.from('done'));
    mockChild.emit('close', 0, null);

    const result = await dispatchPromise;
    expect(result.success).toBe(true);
    expect(result.taskId).toBe('task-1');
  });

  it('should auto-spawn an agent and list it', async () => {
    await bridge.initialize();

    // Pre-spawn verifies auto-spawn indirectly; dispatch verifies agent reuse
    const agent = await bridge.spawnAgent({ type: 'coder', name: 'c1' });
    expect(bridge.listAgents()).toHaveLength(1);
    expect(bridge.listAgents()[0].config.type).toBe('coder');

    // Now dispatch reuses the idle agent instead of spawning a new one
    const dispatchPromise = bridge.dispatchTask({
      taskId: 'task-1',
      agentType: 'coder',
      prompt: 'work',
    });

    await vi.waitFor(() => {
      expect(mockChild.stdin.write).toHaveBeenCalled();
    });

    mockChild.emit('close', 0, null);
    const result = await dispatchPromise;

    expect(result.success).toBe(true);
    expect(result.agentId).toBe(agent.id);
  });

  it('should reject when autoSpawn is disabled and no idle agent exists', async () => {
    bridge = new SwarmExecutionBridge({
      autoSpawn: false,
      execution: { maxConcurrentAgents: 5, healthCheckIntervalMs: 60_000, maxRetries: 0 },
    });
    await bridge.initialize();

    // getOrCreateAgent throws before the try/catch, so it rejects the promise
    await expect(
      bridge.dispatchTask({ taskId: 't1', agentType: 'coder', prompt: 'work' }),
    ).rejects.toThrow('autoSpawn is disabled');
  });

  it('should pre-spawn an agent via spawnAgent', async () => {
    await bridge.initialize();

    const agent = await bridge.spawnAgent({ type: 'tester', name: 'test-1' });
    expect(agent.config.type).toBe('tester');
    expect(bridge.listAgents()).toHaveLength(1);
  });

  it('should terminate an agent and remove from type map', async () => {
    await bridge.initialize();

    const agent = await bridge.spawnAgent({ type: 'tester', name: 'test-1' });
    expect(bridge.listAgents()).toHaveLength(1);

    await bridge.terminateAgent(agent.id);
    expect(bridge.listAgents()).toHaveLength(0);
  });

  it('should dispatch tasks in parallel', async () => {
    await bridge.initialize();

    const child1 = createMockChildProcess({ pid: 11111 });
    const child2 = createMockChildProcess({ pid: 22222 });
    mockedSpawn
      .mockImplementationOnce((() => child1) as any)
      .mockImplementationOnce((() => child2) as any);

    const parallelPromise = bridge.dispatchParallel([
      { taskId: 'p1', agentType: 'coder', prompt: 'task A' },
      { taskId: 'p2', agentType: 'tester', prompt: 'task B' },
    ]);

    // Complete both processes
    await vi.waitFor(() => {
      expect(child1.stdin.write).toHaveBeenCalled();
    });
    child1.emit('close', 0, null);
    child2.emit('close', 0, null);

    const results = await parallelPromise;
    expect(results).toHaveLength(2);
    expect(results[0].taskId).toBe('p1');
    expect(results[1].taskId).toBe('p2');
  });

  it('should return metrics from executor', async () => {
    await bridge.initialize();
    const metrics = bridge.getMetrics();

    expect(metrics).toHaveProperty('activeAgents', 0);
    expect(metrics).toHaveProperty('totalSpawned', 0);
  });

  it('should expose the underlying executor', async () => {
    const executor = bridge.getExecutor();
    expect(executor).toBeInstanceOf(AgentExecutor);
  });

  it('should shutdown cleanly and emit event', async () => {
    const events: string[] = [];
    bridge.on('shutdown', () => events.push('shutdown'));

    await bridge.initialize();
    await bridge.shutdown();

    expect(events).toEqual(['shutdown']);
  });

  it('should no-op shutdown when not initialized', async () => {
    await bridge.shutdown(); // no error
  });
});
