/**
 * @claude-flow/ide - Cursor MCP Bridge
 *
 * Cursor IDE MCP integration. Cursor and Antigravity share the same VS Code
 * base and MCP protocol, so the config schema is largely the same. This
 * bridge generates and writes .cursor/mcp.json for the Ruflo MCP server.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CursorMCPServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface CursorMCPConfig {
  mcpServers: Record<string, CursorMCPServerEntry>;
}

export interface CursorMCPBridgeOptions {
  /** Name used as the server key in .cursor/mcp.json */
  serverName?: string;
  /** Whether to merge with existing config rather than overwrite */
  merge?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

export class CursorMCPBridge extends EventEmitter {
  private readonly options: Required<CursorMCPBridgeOptions>;

  constructor(options: CursorMCPBridgeOptions = {}) {
    super();
    this.options = {
      serverName: options.serverName ?? 'ruflo',
      merge: options.merge ?? true,
    };
  }

  /**
   * Generates the contents of .cursor/mcp.json that points to the Ruflo
   * MCP server. Cursor expects the `mcpServers` top-level key.
   */
  generateMCPConfig(): CursorMCPConfig {
    return {
      mcpServers: {
        [this.options.serverName]: {
          command: 'npx',
          args: ['claude-flow@v3alpha', 'mcp', 'start'],
          env: {
            CLAUDE_FLOW_MCP_TRANSPORT: 'stdio',
          },
        },
      },
    };
  }

  /**
   * Writes .cursor/mcp.json to the given workspace root.
   * When merge is true (the default), existing non-Ruflo servers are
   * preserved and only the Ruflo entry is added / updated.
   */
  init(workspaceRoot: string): void {
    const dir = join(workspaceRoot, '.cursor');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const configPath = join(dir, 'mcp.json');
    const generated = this.generateMCPConfig();

    let final: CursorMCPConfig = generated;

    if (this.options.merge && existsSync(configPath)) {
      try {
        const existing = JSON.parse(readFileSync(configPath, 'utf8')) as Partial<CursorMCPConfig>;
        final = {
          mcpServers: {
            ...(existing.mcpServers ?? {}),
            ...generated.mcpServers,
          },
        };
      } catch {
        // malformed existing file — overwrite
      }
    }

    writeFileSync(configPath, JSON.stringify(final, null, 2) + '\n', 'utf8');
    this.emit('initialized', workspaceRoot, configPath);
  }

  /**
   * Returns the path where .cursor/mcp.json would be written
   * for the given workspace root.
   */
  getConfigPath(workspaceRoot: string): string {
    return join(workspaceRoot, '.cursor', 'mcp.json');
  }

  /**
   * Returns true if .cursor/mcp.json already exists in the workspace.
   */
  isInitialized(workspaceRoot: string): boolean {
    return existsSync(this.getConfigPath(workspaceRoot));
  }
}
