/**
 * Ruflo MCP Streamable HTTP Server
 *
 * Bridges the existing MCP tool registry to the official @modelcontextprotocol/sdk
 * StreamableHTTPServerTransport for remote deployment (Railway, Fly.io, etc.).
 *
 * Claude Code connects via:
 *   claude mcp add --transport http ruflo https://your-app.up.railway.app/mcp
 *
 * @module @claude-flow/cli/mcp-streamable-http
 * @version 3.5.0
 */

import express from 'express';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { listMCPTools, callMCPTool, hasTool } from './mcp-client.js';
import type { MCPToolInputSchema } from './mcp-tools/types.js';

const VERSION = '3.5.0';
const PORT = parseInt(process.env.PORT || '3000', 10);

/**
 * Convert our internal inputSchema format to Zod shape for the MCP SDK.
 * The SDK uses Zod for input validation; we convert our JSON Schema-like
 * definitions to a permissive z.object that passes through all params.
 */
function schemaToZodShape(schema: MCPToolInputSchema): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  const required = new Set(schema.required || []);

  for (const [key, propDef] of Object.entries(schema.properties)) {
    const prop = propDef as Record<string, unknown>;
    let field: z.ZodTypeAny;

    switch (prop.type) {
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

    if (prop.description) {
      field = field.describe(prop.description as string);
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
function createServer(): McpServer {
  const server = new McpServer({
    name: 'ruflo',
    version: VERSION,
  });

  // Get all tools from the existing registry
  const tools = listMCPTools();

  for (const tool of tools) {
    const zodShape = schemaToZodShape(tool.inputSchema);

    server.tool(
      tool.name,
      tool.description,
      zodShape,
      async (params: Record<string, unknown>) => {
        try {
          const result = await callMCPTool(tool.name, params, {
            sessionId: `http-${Date.now().toString(36)}`,
            transport: 'streamable-http',
          });

          // Normalize result to MCP SDK content format
          if (result && typeof result === 'object' && 'content' in (result as Record<string, unknown>)) {
            return result as { content: Array<{ type: 'text'; text: string }> };
          }

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            }],
            isError: true,
          };
        }
      }
    );
  }

  console.error(`[ruflo-mcp] Registered ${tools.length} tools on MCP server`);
  return server;
}

/**
 * Start the Express app with Streamable HTTP transport
 */
async function main(): Promise<void> {
  const app = express();

  // The MCP server instance (shared across transports)
  const mcpServer = createServer();

  // Store transports by session ID for stateful mode
  const transports = new Map<string, StreamableHTTPServerTransport>();

  //
  // POST /mcp — Handle client requests (stateless mode)
  //
  // Stateless: each request creates a fresh transport, processes it, and cleans up.
  // This is the simplest approach for cloud deployment (no sticky sessions needed).
  //
  app.post('/mcp', async (req, res) => {
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
      });

      // Connect transport to our MCP server
      await mcpServer.connect(transport);

      // Handle the request
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

  //
  // GET /mcp — SSE stream for server-initiated notifications (optional)
  //
  app.get('/mcp', async (req, res) => {
    // For stateless mode, we don't support GET (no server-initiated messages)
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Server is running in stateless mode. GET is not supported for server-initiated messages.',
      },
      id: null,
    });
  });

  //
  // DELETE /mcp — Session cleanup (no-op in stateless mode)
  //
  app.delete('/mcp', async (_req, res) => {
    res.status(200).json({ ok: true });
  });

  //
  // Health check endpoint
  //
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

  //
  // Root — basic info
  //
  app.get('/', (_req, res) => {
    res.json({
      name: 'ruflo',
      version: VERSION,
      description: 'Ruflo MCP Server — Enterprise AI agent orchestration',
      transport: 'streamable-http',
      endpoints: {
        mcp: '/mcp',
        health: '/health',
      },
      docs: 'https://github.com/ruvnet/claude-flow',
    });
  });

  // Start listening
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
