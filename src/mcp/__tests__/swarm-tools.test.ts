/**
 * V3 MCP Swarm Tools Tests
 *
 * Tests for swarm coordination MCP tools:
 * - swarm/init
 * - swarm/status
 * - swarm/scale
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initSwarmTool,
  swarmStatusTool,
  scaleSwarmTool,
  swarmTools,
} from '../tools/swarm-tools.js';
import { ToolContext } from '../types.js';

describe('Swarm Tools', () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    mockContext = {
      sessionId: 'test-session',
    };
  });

  describe('swarm/init', () => {
    it('should have correct tool definition', () => {
      expect(initSwarmTool.name).toBe('swarm/init');
      expect(initSwarmTool.category).toBe('swarm');
      expect(initSwarmTool.inputSchema.type).toBe('object');
    });

    it('should initialize swarm with defaults', async () => {
      const result = await initSwarmTool.handler({}, mockContext);

      expect(result).toBeDefined();
      expect(result.swarmId).toBeDefined();
      expect(result.swarmId).toMatch(/^swarm-/);
      expect(result.topology).toBeDefined();
      expect(result.initializedAt).toBeDefined();
      expect(result.config).toBeDefined();
    });

    it('should initialize swarm with custom topology', async () => {
      const result = await initSwarmTool.handler({
        topology: 'hierarchical',
        maxAgents: 8,
      }, mockContext);

      expect(result.topology).toBe('hierarchical');
      expect(result.config.maxAgents).toBe(8);
    });

    it('should accept config options', async () => {
      const result = await initSwarmTool.handler({
        topology: 'mesh',
        config: {
          communicationProtocol: 'pubsub',
          consensusMechanism: 'unanimous',
          loadBalancing: true,
        },
      }, mockContext);

      expect(result.config.communicationProtocol).toBe('pubsub');
      expect(result.config.consensusMechanism).toBe('unanimous');
    });
  });

  describe('swarm/status', () => {
    it('should have correct tool definition', () => {
      expect(swarmStatusTool.name).toBe('swarm/status');
      expect(swarmStatusTool.category).toBe('swarm');
      expect(swarmStatusTool.cacheable).toBe(true);
    });

    it('should return swarm status', async () => {
      const result = await swarmStatusTool.handler({}, mockContext);

      expect(result).toBeDefined();
      expect(result.swarmId).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.config).toBeDefined();
    });

    it('should return stopped status when no coordinator', async () => {
      const result = await swarmStatusTool.handler({}, mockContext);

      expect(result.status).toBe('stopped');
      expect(result.config.currentAgents).toBe(0);
    });
  });

  describe('swarm/scale', () => {
    it('should have correct tool definition', () => {
      expect(scaleSwarmTool.name).toBe('swarm/scale');
      expect(scaleSwarmTool.category).toBe('swarm');
      expect(scaleSwarmTool.inputSchema.required).toContain('targetAgents');
    });

    it('should return scale result', async () => {
      const result = await scaleSwarmTool.handler({
        targetAgents: 10,
      }, mockContext);

      expect(result).toBeDefined();
      expect(result.targetAgents).toBe(10);
      expect(result.scaledAt).toBeDefined();
      expect(result.scalingStatus).toBeDefined();
    });

    it('should return failed status without coordinator', async () => {
      const result = await scaleSwarmTool.handler({
        targetAgents: 5,
        scaleStrategy: 'immediate',
      }, mockContext);

      expect(result.scalingStatus).toBe('failed');
      expect(result.previousAgents).toBe(0);
    });
  });

  describe('Tool Collection', () => {
    it('should export all 3 swarm tools', () => {
      expect(swarmTools).toHaveLength(3);
    });

    it('should have unique tool names', () => {
      const names = swarmTools.map(t => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('should all have handlers', () => {
      swarmTools.forEach(tool => {
        expect(typeof tool.handler).toBe('function');
      });
    });

    it('should all be in swarm category', () => {
      swarmTools.forEach(tool => {
        expect(tool.category).toBe('swarm');
      });
    });
  });
});
