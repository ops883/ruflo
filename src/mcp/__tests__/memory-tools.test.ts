/**
 * V3 MCP Memory Tools Tests
 *
 * Tests for memory management MCP tools:
 * - memory/store
 * - memory/search
 * - memory/list
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  storeMemoryTool,
  searchMemoryTool,
  listMemoryTool,
  memoryTools,
} from '../tools/memory-tools.js';
import { ToolContext } from '../types.js';

describe('Memory Tools', () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    mockContext = {
      sessionId: 'test-session',
    };
  });

  describe('memory/store', () => {
    it('should have correct tool definition', () => {
      expect(storeMemoryTool.name).toBe('memory/store');
      expect(storeMemoryTool.category).toBe('memory');
      expect(storeMemoryTool.inputSchema.required).toContain('content');
    });

    it('should store a memory with required fields', async () => {
      const result = await storeMemoryTool.handler({
        content: 'Test memory content',
      }, mockContext);

      expect(result).toBeDefined();
      expect(result.id).toMatch(/^mem-/);
      expect(result.stored).toBe(true);
      expect(result.storedAt).toBeDefined();
    });

    it('should store a memory with optional fields', async () => {
      const result = await storeMemoryTool.handler({
        content: 'Tagged memory',
        type: 'semantic',
        category: 'code',
        tags: ['test', 'example'],
        importance: 0.8,
      }, mockContext);

      expect(result.stored).toBe(true);
    });
  });

  describe('memory/search', () => {
    it('should have correct tool definition', () => {
      expect(searchMemoryTool.name).toBe('memory/search');
      expect(searchMemoryTool.category).toBe('memory');
      expect(searchMemoryTool.inputSchema.required).toContain('query');
      expect(searchMemoryTool.cacheable).toBe(true);
    });

    it('should search with required fields', async () => {
      const result = await searchMemoryTool.handler({
        query: 'authentication patterns',
      }, mockContext);

      expect(result).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.query).toBe('authentication patterns');
      expect(result.searchType).toBeDefined();
      expect(typeof result.executionTime).toBe('number');
    });

    it('should search with filters', async () => {
      const result = await searchMemoryTool.handler({
        query: 'test query',
        searchType: 'keyword',
        type: 'episodic',
        limit: 5,
      }, mockContext);

      expect(result.total).toBeDefined();
    });
  });

  describe('memory/list', () => {
    it('should have correct tool definition', () => {
      expect(listMemoryTool.name).toBe('memory/list');
      expect(listMemoryTool.category).toBe('memory');
      expect(listMemoryTool.cacheable).toBe(true);
    });

    it('should list memories with defaults', async () => {
      const result = await listMemoryTool.handler({}, mockContext);

      expect(result).toBeDefined();
      expect(Array.isArray(result.memories)).toBe(true);
      expect(result.total).toBeDefined();
      expect(result.limit).toBeDefined();
      expect(result.offset).toBeDefined();
    });

    it('should accept pagination parameters', async () => {
      const result = await listMemoryTool.handler({
        limit: 20,
        offset: 10,
        sortBy: 'importance',
        sortOrder: 'asc',
      }, mockContext);

      expect(result.limit).toBe(20);
      expect(result.offset).toBe(10);
    });
  });

  describe('Tool Collection', () => {
    it('should export all 3 memory tools', () => {
      expect(memoryTools).toHaveLength(3);
    });

    it('should have unique tool names', () => {
      const names = memoryTools.map(t => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('should all have handlers', () => {
      memoryTools.forEach(tool => {
        expect(typeof tool.handler).toBe('function');
      });
    });

    it('should all be in memory category', () => {
      memoryTools.forEach(tool => {
        expect(tool.category).toBe('memory');
      });
    });
  });
});
