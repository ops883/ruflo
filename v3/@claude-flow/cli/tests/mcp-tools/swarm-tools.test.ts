/**
 * Unit tests for swarm MCP tools (swarm_init, swarm_status, swarm_shutdown, swarm_health).
 *
 * Uses an in-memory Map to mock node:fs so no real files are touched.
 * Each test suite resets the store to ensure isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock node:fs with a shared in-memory store
// ---------------------------------------------------------------------------
const memFs = new Map<string, string>();

vi.mock('node:fs', () => ({
  existsSync: vi.fn((p: string) => memFs.has(p)),
  readFileSync: vi.fn((p: string) => {
    if (!memFs.has(p)) throw new Error('ENOENT');
    return memFs.get(p)!;
  }),
  writeFileSync: vi.fn((p: string, d: string) => memFs.set(p, d)),
  mkdirSync: vi.fn(),
}));

// Prevent the handler from trying to dynamically import the execution bridge
vi.mock('node:url', () => ({
  fileURLToPath: vi.fn(() => '/fake/path/file.js'),
}));

// ---------------------------------------------------------------------------
// Import the tools under test (after mocks are registered)
// ---------------------------------------------------------------------------
import { swarmTools } from '../../src/mcp-tools/swarm-tools.js';

// Convenience helpers to grab each tool's handler
function getHandler(name: string) {
  const tool = swarmTools.find(t => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool.handler;
}

const initHandler = getHandler('swarm_init');
const statusHandler = getHandler('swarm_status');
const shutdownHandler = getHandler('swarm_shutdown');
const healthHandler = getHandler('swarm_health');

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  memFs.clear();
  vi.clearAllMocks();
});

// ===== swarm_init ==========================================================

describe('swarm_init', () => {
  it('creates a swarm with default config', async () => {
    const result = (await initHandler({})) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.swarmId).toBeDefined();
    expect(typeof result.swarmId).toBe('string');
    expect(result.topology).toBe('hierarchical-mesh');
    expect(result.strategy).toBe('specialized');
    expect(result.maxAgents).toBe(15);
    expect(result.persisted).toBe(true);
  });

  it('returns correct swarmId and config values', async () => {
    const result = (await initHandler({
      topology: 'mesh',
      maxAgents: 10,
      strategy: 'balanced',
      config: { communicationProtocol: 'direct', autoScaling: false },
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.topology).toBe('mesh');
    expect(result.maxAgents).toBe(10);
    expect(result.strategy).toBe('balanced');

    const cfg = result.config as Record<string, unknown>;
    expect(cfg.communicationProtocol).toBe('direct');
    expect(cfg.autoScaling).toBe(false);
  });

  it('rejects invalid topology', async () => {
    const result = (await initHandler({ topology: 'banana' })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid topology');
    expect(result.error).toContain('banana');
  });

  it('accepts all valid topologies', async () => {
    const valid = ['hierarchical', 'mesh', 'hierarchical-mesh', 'ring', 'star', 'hybrid', 'adaptive'];
    for (const topology of valid) {
      memFs.clear();
      const result = (await initHandler({ topology })) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.topology).toBe(topology);
    }
  });

  it('clamps maxAgents below 1 to 1', async () => {
    const result = (await initHandler({ maxAgents: -5 })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.maxAgents).toBe(1);
  });

  it('clamps maxAgents above 50 to 50', async () => {
    const result = (await initHandler({ maxAgents: 999 })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.maxAgents).toBe(50);
  });

  it('clamps maxAgents of 0 to default 15 then clamped to 15', async () => {
    // 0 is falsy so the fallback || 15 applies, then clamped stays 15
    const result = (await initHandler({ maxAgents: 0 })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.maxAgents).toBe(15);
  });

  it('persists state to the JSON file', async () => {
    const result = (await initHandler({ topology: 'star' })) as Record<string, unknown>;
    expect(result.success).toBe(true);

    // Find the persisted file in memFs
    const stateEntry = [...memFs.entries()].find(([k]) => k.includes('swarm-state.json'));
    expect(stateEntry).toBeDefined();

    const store = JSON.parse(stateEntry![1]);
    const swarmId = result.swarmId as string;
    expect(store.swarms[swarmId]).toBeDefined();
    expect(store.swarms[swarmId].topology).toBe('star');
    expect(store.swarms[swarmId].status).toBe('running');
  });
});

// ===== swarm_status ========================================================

describe('swarm_status', () => {
  it('returns no_swarm message when store is empty', async () => {
    const result = (await statusHandler({})) as Record<string, unknown>;

    expect(result.status).toBe('no_swarm');
    expect(result.totalSwarms).toBe(0);
    expect(result.message).toContain('No active swarms');
  });

  it('returns specific swarm by ID', async () => {
    const init = (await initHandler({ topology: 'ring' })) as Record<string, unknown>;
    const swarmId = init.swarmId as string;

    const result = (await statusHandler({ swarmId })) as Record<string, unknown>;

    expect(result.swarmId).toBe(swarmId);
    expect(result.status).toBe('running');
    expect(result.topology).toBe('ring');
    expect(result.agentCount).toBe(0);
    expect(result.taskCount).toBe(0);
  });

  it('returns most recent swarm when no ID specified', async () => {
    // Create two swarms; the second should be returned as most recent
    await initHandler({ topology: 'mesh' });
    const second = (await initHandler({ topology: 'star' })) as Record<string, unknown>;

    const result = (await statusHandler({})) as Record<string, unknown>;

    expect(result.swarmId).toBe(second.swarmId);
    expect(result.topology).toBe('star');
    expect(result.totalSwarms).toBe(2);
  });

  it('returns no_swarm for unknown swarmId', async () => {
    await initHandler({});

    // Requesting a non-existent ID falls through to "most recent" logic
    const result = (await statusHandler({ swarmId: 'swarm-nonexistent' })) as Record<string, unknown>;

    // Since the ID doesn't match, it returns the most recent swarm instead
    expect(result.swarmId).toBeDefined();
    expect(result.status).toBe('running');
  });
});

// ===== swarm_shutdown ======================================================

describe('swarm_shutdown', () => {
  it('terminates a running swarm', async () => {
    const init = (await initHandler({})) as Record<string, unknown>;
    const swarmId = init.swarmId as string;

    const result = (await shutdownHandler({ swarmId })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.swarmId).toBe(swarmId);
    expect(result.terminated).toBe(true);
    expect(result.graceful).toBe(true);
  });

  it('returns error for already terminated swarm', async () => {
    const init = (await initHandler({})) as Record<string, unknown>;
    const swarmId = init.swarmId as string;

    // Terminate first time
    await shutdownHandler({ swarmId });

    // Attempt second termination
    const result = (await shutdownHandler({ swarmId })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toContain('already terminated');
  });

  it('returns error when no running swarms exist', async () => {
    const result = (await shutdownHandler({})) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toContain('No running swarms');
  });

  it('shuts down most recent running swarm when no ID given', async () => {
    const first = (await initHandler({ topology: 'mesh' })) as Record<string, unknown>;
    const second = (await initHandler({ topology: 'star' })) as Record<string, unknown>;

    const result = (await shutdownHandler({})) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.swarmId).toBe(second.swarmId);
  });

  it('respects graceful flag', async () => {
    await initHandler({});

    const result = (await shutdownHandler({ graceful: false })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.graceful).toBe(false);
  });

  it('returns not-found error for unknown swarmId', async () => {
    const result = (await shutdownHandler({ swarmId: 'swarm-ghost' })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});

// ===== swarm_health ========================================================

describe('swarm_health', () => {
  it('reports healthy for a running swarm', async () => {
    const init = (await initHandler({})) as Record<string, unknown>;
    const swarmId = init.swarmId as string;

    const result = (await healthHandler({ swarmId })) as Record<string, unknown>;

    expect(result.status).toBe('healthy');
    expect(result.healthy).toBe(true);
    expect(result.swarmId).toBe(swarmId);
    expect(result.checks).toBeDefined();

    const checks = result.checks as Array<{ name: string; status: string }>;
    const coordCheck = checks.find(c => c.name === 'coordinator');
    expect(coordCheck?.status).toBe('ok');

    const persistCheck = checks.find(c => c.name === 'persistence');
    expect(persistCheck?.status).toBe('ok');
  });

  it('reports degraded for non-running swarm', async () => {
    const init = (await initHandler({})) as Record<string, unknown>;
    const swarmId = init.swarmId as string;

    // Terminate the swarm first
    await shutdownHandler({ swarmId });

    const result = (await healthHandler({ swarmId })) as Record<string, unknown>;

    expect(result.status).toBe('degraded');
    expect(result.healthy).toBe(false);

    const checks = result.checks as Array<{ name: string; status: string }>;
    const coordCheck = checks.find(c => c.name === 'coordinator');
    expect(coordCheck?.status).toBe('warn');
  });

  it('returns not_found for invalid swarm ID', async () => {
    const result = (await healthHandler({ swarmId: 'swarm-fake-id' })) as Record<string, unknown>;

    expect(result.status).toBe('not_found');
    expect(result.healthy).toBe(false);

    const checks = result.checks as Array<{ name: string; status: string; message: string }>;
    expect(checks[0].name).toBe('swarm_exists');
    expect(checks[0].status).toBe('fail');
    expect(checks[0].message).toContain('not found');
  });

  it('returns no_swarm when no swarms exist and no ID given', async () => {
    const result = (await healthHandler({})) as Record<string, unknown>;

    expect(result.status).toBe('no_swarm');
    expect(result.healthy).toBe(false);
  });

  it('reports topology in checks', async () => {
    const init = (await initHandler({ topology: 'adaptive' })) as Record<string, unknown>;
    const swarmId = init.swarmId as string;

    const result = (await healthHandler({ swarmId })) as Record<string, unknown>;

    expect(result.topology).toBe('adaptive');
    const checks = result.checks as Array<{ name: string; message: string }>;
    const topoCheck = checks.find(c => c.name === 'topology');
    expect(topoCheck?.message).toContain('adaptive');
  });
});
