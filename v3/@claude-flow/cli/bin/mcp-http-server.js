#!/usr/bin/env node
/**
 * Ruflo MCP Streamable HTTP Server — Entry Point
 *
 * Starts the MCP server with Streamable HTTP transport for remote deployment.
 * Used by Railway, Fly.io, or any container platform.
 *
 * Usage:
 *   node bin/mcp-http-server.js
 *   PORT=8080 node bin/mcp-http-server.js
 *
 * Connect from Claude Code:
 *   claude mcp add --transport http ruflo https://your-app.up.railway.app/mcp
 */

import '../dist/src/mcp-streamable-http.js';
