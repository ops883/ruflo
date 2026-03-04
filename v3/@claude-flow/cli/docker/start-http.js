#!/usr/bin/env node
/**
 * Ruflo MCP Streamable HTTP Server — Docker Entry Point
 *
 * Self-contained HTTP server for Railway/container deployment.
 * Bridges the existing MCP tool registry to the official @modelcontextprotocol/sdk
 * StreamableHTTPServerTransport.
 *
 * This file is COPIED into the Docker image and resolves imports from the
 * globally-installed @claude-flow/cli package at runtime.
 *
 * Usage:
 *   node start-http.js
 *   PORT=8080 node start-http.js
 *
 * Connect from Claude Code:
 *   claude mcp add --transport http ruflo https://your-app.up.railway.app/mcp
 */

import { createRequire } from 'module';
import { findCLIPath } from './resolve-cli.js';

// Resolve @claude-flow/cli dist directory dynamically
const cliPath = findCLIPath();
const cliDist = `${cliPath}/dist/src`;

// Dynamic imports from the installed @claude-flow/cli package
const { listMCPTools, callMCPTool, hasTool } = await import(`${cliDist}/mcp-client.js`);

// SDK and express from the ruflo/node_modules tree
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const VERSION = '3.5.0';
const PORT = parseInt(process.env.PORT || '3000', 10);

/**
 * Convert internal inputSchema format to Zod shape for the MCP SDK.
 */
function schemaToZodShape(schema) {
  const shape = {};
  const required = new Set(schema.required || []);

  for (const [key, propDef] of Object.entries(schema.properties)) {
    let field;
    switch (propDef.type) {
      case 'number':
      case 'integer':
        field = z.number();
        break;
      case 'boolean':
        field = z.boolean();
        break;
      case 'array':
        field = z.array(z.any());
        break;
      case 'object':
        field = z.record(z.any());
        break;
      default:
        field = z.string();
    }
    if (propDef.description) {
      field = field.describe(propDef.description);
    }
    if (!required.has(key)) {
      field = field.optional();
    }
    shape[key] = field;
  }
  return shape;
}

/**
 * Create and configure the MCP server with all registered tools
 */
function createServer() {
  const server = new McpServer({ name: 'ruflo', version: VERSION });
  const tools = listMCPTools();

  for (const tool of tools) {
    const zodShape = schemaToZodShape(tool.inputSchema);
    server.tool(tool.name, tool.description, zodShape, async (params) => {
      try {
        const result = await callMCPTool(tool.name, params, {
          sessionId: `http-${Date.now().toString(36)}`,
          transport: 'streamable-http',
        });
        if (result && typeof result === 'object' && 'content' in result) {
          return result;
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message || String(error)}` }],
          isError: true,
        };
      }
    });
  }

  console.error(`[ruflo-mcp] Registered ${tools.length} tools on MCP server`);
  return server;
}

/**
 * Start the Express app with Streamable HTTP transport
 */
async function main() {
  const app = express();
  const mcpServer = createServer();

  // POST /mcp — Handle client requests (stateless mode)
  app.post('/mcp', async (req, res) => {
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error('[ruflo-mcp] POST /mcp error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // GET /mcp — Not supported in stateless mode
  app.get('/mcp', (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Server is running in stateless mode. GET is not supported.',
      },
      id: null,
    });
  });

  // DELETE /mcp — No-op in stateless mode
  app.delete('/mcp', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // Health check
  app.get('/health', (_req, res) => {
    const tools = listMCPTools();
    res.json({
      status: 'ok',
      version: VERSION,
      tools: tools.length,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Root — basic info
  app.get('/', (_req, res) => {
    res.json({
      name: 'ruflo',
      version: VERSION,
      description: 'Ruflo MCP Server — Enterprise AI agent orchestration',
      transport: 'streamable-http',
      endpoints: { mcp: '/mcp', health: '/health' },
      docs: 'https://github.com/ruvnet/claude-flow',
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.error(`[ruflo-mcp] Streamable HTTP server listening on 0.0.0.0:${PORT}`);
    console.error(`[ruflo-mcp] MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
    console.error(`[ruflo-mcp] Health check: http://0.0.0.0:${PORT}/health`);
  });
}

main().catch((error) => {
  console.error('[ruflo-mcp] Fatal error:', error);
  process.exit(1);
});
