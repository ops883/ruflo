/**
 * V3 MCP Agent Tools Tests
 *
 * Tests for agent lifecycle MCP tools:
 * - agent/spawn
 * - agent/list
 * - agent/terminate
 * - agent/status
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  spawnAgentTool,
  listAgentsTool,
  terminateAgentTool,
  agentStatusTool,
  agentTools,
} from '../tools/agent-tools.js';
import { ToolContext } from '../types.js';

describe('Agent Tools', () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    mockContext = {
      sessionId: 'test-session',
    };
  });

  describe('agent/spawn', () => {
    it('should have correct tool definition', () => {
      expect(spawnAgentTool.name).toBe('agent/spawn');
      expect(spawnAgentTool.category).toBe('agent');
      expect(spawnAgentTool.inputSchema.required).toContain('agentType');
    });

    it('should spawn an agent with required fields', async () => {
      const result = await spawnAgentTool.handler({
        agentType: 'coder',
      }, mockContext);

      expect(result).toBeDefined();
      expect(result.agentId).toBeDefined();
      expect(result.agentType).toBe('coder');
      expect(result.status).toBe('active');
    });

    it('should spawn an agent with custom id', async () => {
      const result = await spawnAgentTool.handler({
        agentType: 'tester',
        id: 'my-custom-agent',
      }, mockContext);

      expect(result.agentId).toBe('my-custom-agent');
    });

    it('should auto-generate an id when not provided', async () => {
      const result = await spawnAgentTool.handler({
        agentType: 'reviewer',
      }, mockContext);

      expect(result.agentId).toMatch(/^agent-/);
      expect(result.createdAt).toBeDefined();
    });
  });

  describe('agent/list', () => {
    it('should have correct tool definition', () => {
      expect(listAgentsTool.name).toBe('agent/list');
      expect(listAgentsTool.category).toBe('agent');
      expect(listAgentsTool.cacheable).toBe(true);
    });

    it('should list agents with no filters', async () => {
      const result = await listAgentsTool.handler({}, mockContext);

      expect(result).toBeDefined();
      expect(Array.isArray(result.agents)).toBe(true);
      expect(result.total).toBeDefined();
    });

    it('should accept filter parameters', async () => {
      const result = await listAgentsTool.handler({
        status: 'active',
        limit: 10,
        offset: 0,
      }, mockContext);

      expect(result).toBeDefined();
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
    });
  });

  describe('agent/terminate', () => {
    it('should have correct tool definition', () => {
      expect(terminateAgentTool.name).toBe('agent/terminate');
      expect(terminateAgentTool.category).toBe('agent');
      expect(terminateAgentTool.inputSchema.required).toContain('agentId');
    });

    it('should terminate an agent', async () => {
      const result = await terminateAgentTool.handler({
        agentId: 'agent-123',
      }, mockContext);

      expect(result).toBeDefined();
      expect(result.agentId).toBe('agent-123');
      expect(result.terminatedAt).toBeDefined();
    });

    it('should include termination reason', async () => {
      const result = await terminateAgentTool.handler({
        agentId: 'agent-123',
        reason: 'Task completed',
      }, mockContext);

      expect(result.reason).toBe('Task completed');
    });
  });

  describe('agent/status', () => {
    it('should have correct tool definition', () => {
      expect(agentStatusTool.name).toBe('agent/status');
      expect(agentStatusTool.category).toBe('agent');
      expect(agentStatusTool.inputSchema.required).toContain('agentId');
    });

    it('should throw for non-existent agent without coordinator', async () => {
      await expect(agentStatusTool.handler({
        agentId: 'non-existent',
      }, mockContext)).rejects.toThrow('Agent not found');
    });
  });

  describe('Tool Collection', () => {
    it('should export all 4 agent tools', () => {
      expect(agentTools).toHaveLength(4);
    });

    it('should have unique tool names', () => {
      const names = agentTools.map(t => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('should all have handlers', () => {
      agentTools.forEach(tool => {
        expect(typeof tool.handler).toBe('function');
      });
    });

    it('should all be in agent category', () => {
      agentTools.forEach(tool => {
        expect(tool.category).toBe('agent');
      });
    });
  });
});
