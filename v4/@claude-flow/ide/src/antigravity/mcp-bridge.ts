/**
 * @claude-flow/ide - Antigravity MCP Bridge
 *
 * Google Antigravity IDE MCP integration. Antigravity is built on VS Code
 * and supports MCP natively. This bridge registers Ruflo tools with the
 * Antigravity MCP server and writes the workspace config file.
 */

import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AntigravityMCPConfig {
  version: string;
  servers: AntigravityMCPServer[];
}

export interface AntigravityMCPServer {
  name: string;
  transport: 'stdio' | 'sse' | 'websocket';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

export interface RufloMCPServer {
  registerTool(tool: MCPToolDefinition): void;
  listTools(): MCPToolDefinition[];
}

export interface BridgeEvents {
  initialized: [workspaceRoot: string];
  toolRegistered: [toolName: string];
  toolError: [toolName: string, error: Error];
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

export class AntigravityMCPBridge extends EventEmitter {
  private readonly registeredTools = new Map<string, MCPToolDefinition>();

  constructor() {
    super();
  }

  /**
   * Produces the content for .antigravity/mcp.json pointing to the
   * Ruflo MCP server via npx stdio transport.
   */
  generateConfig(): AntigravityMCPConfig {
    return {
      version: '1.0',
      servers: [
        {
          name: 'ruflo',
          transport: 'stdio',
          command: 'npx',
          args: ['claude-flow@v3alpha', 'mcp', 'start'],
          env: {
            CLAUDE_FLOW_MCP_TRANSPORT: 'stdio',
          },
        },
      ],
    };
  }

  /**
   * Registers the four core Ruflo tools on the given MCP server instance.
   * Each handler shells out to the Ruflo CLI so no direct library dependency
   * is required at runtime.
   */
  registerTools(mcpServer: RufloMCPServer): void {
    const tools: MCPToolDefinition[] = [
      {
        name: 'ruflo_spawn_swarm',
        description: 'Spawn a Ruflo agent swarm for a given task description.',
        inputSchema: {
          type: 'object',
          properties: {
            task: { type: 'string', description: 'Task description for the swarm' },
            topology: {
              type: 'string',
              enum: ['hierarchical', 'mesh', 'hierarchical-mesh'],
              description: 'Swarm topology',
            },
            maxAgents: { type: 'number', description: 'Maximum number of agents' },
          },
          required: ['task'],
        },
        handler: async (input) => {
          const task = String(input['task'] ?? '');
          const topology = String(input['topology'] ?? 'hierarchical');
          const maxAgents = Number(input['maxAgents'] ?? 8);
          return this.runCli(
            `swarm init --topology ${topology} --max-agents ${maxAgents} --task ${JSON.stringify(task)}`,
          );
        },
      },
      {
        name: 'ruflo_memory_search',
        description: 'Search the Ruflo ReasoningBank memory for relevant patterns.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Semantic search query' },
            namespace: { type: 'string', description: 'Memory namespace to search' },
            limit: { type: 'number', description: 'Maximum number of results' },
          },
          required: ['query'],
        },
        handler: async (input) => {
          const query = String(input['query'] ?? '');
          const namespace = input['namespace'] ? `--namespace ${String(input['namespace'])}` : '';
          const limit = input['limit'] ? `--limit ${Number(input['limit'])}` : '';
          return this.runCli(`memory search --query ${JSON.stringify(query)} ${namespace} ${limit}`.trim());
        },
      },
      {
        name: 'ruflo_get_context',
        description: 'Retrieve formatted context from Ruflo memory for a task prompt.',
        inputSchema: {
          type: 'object',
          properties: {
            task: { type: 'string', description: 'Task description to fetch context for' },
          },
          required: ['task'],
        },
        handler: async (input) => {
          const task = String(input['task'] ?? '');
          return this.runCli(`memory search --query ${JSON.stringify(task)} --limit 5`);
        },
      },
      {
        name: 'ruflo_swarm_status',
        description: 'Get the current status of the active Ruflo swarm.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        handler: async (_input) => {
          return this.runCli('swarm status');
        },
      },
    ];

    for (const tool of tools) {
      try {
        mcpServer.registerTool(tool);
        this.registeredTools.set(tool.name, tool);
        this.emit('toolRegistered', tool.name);
      } catch (err) {
        this.emit('toolError', tool.name, err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  /**
   * Writes .antigravity/mcp.json to the workspace root.
   * Creates the directory if it does not exist.
   */
  init(workspaceRoot: string): void {
    const dir = join(workspaceRoot, '.antigravity');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const configPath = join(dir, 'mcp.json');
    const config = this.generateConfig();

    // Preserve any existing non-ruflo servers when the file already exists
    if (existsSync(configPath)) {
      try {
        const existing: AntigravityMCPConfig = JSON.parse(readFileSync(configPath, 'utf8'));
        const otherServers = existing.servers.filter((s) => s.name !== 'ruflo');
        config.servers = [...otherServers, ...config.servers];
      } catch {
        // malformed existing file — overwrite
      }
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    this.emit('initialized', workspaceRoot);
  }

  /**
   * Returns the list of currently registered tool names.
   */
  listRegisteredTools(): string[] {
    return Array.from(this.registeredTools.keys());
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private runCli(args: string): Promise<{ stdout: string; success: boolean }> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';

      const child = spawn('npx', ['claude-flow@v3alpha', ...args.split(' ')], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      });

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('close', (code) => {
        resolve({
          stdout: stdout || stderr,
          success: code === 0,
        });
      });

      child.on('error', (err) => {
        resolve({ stdout: err.message, success: false });
      });
    });
  }
}
