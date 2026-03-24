# MCP Server

Ruflo runs as an MCP (Model Context Protocol) server, making all 259 tools available to any MCP-compatible client.

!!! note "Version tags"
    Examples below use `ruflo@latest` for CLI commands and `ruflo@v3alpha` in JSON configs (matching the upstream README). Substitute whichever version you're using.

## Starting the Server

```bash
npx ruflo@latest mcp start
```

## Connecting to Claude Code

```bash
# Add permanently
claude mcp add ruflo -- npx -y ruflo@latest mcp start

# Verify
claude mcp list
```

## Connecting to Claude Desktop

Edit `claude_desktop_config.json`:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ruflo": {
      "command": "npx",
      "args": ["ruflo@v3alpha", "mcp", "start"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

Restart Claude Desktop. Look for the hammer icon in the input box.

## Connecting to VS Code

Requires VS Code 1.102+ (MCP is GA).

Open Command Palette → **MCP: Add Server** → enter:

```
npx ruflo@latest mcp start
```

## Connecting to Cursor / Windsurf

Add to your MCP configuration file (`.cursor/mcp.json` or `.windsurf/mcp.json`):

```json
{
  "mcpServers": {
    "ruflo": {
      "command": "npx",
      "args": ["-y", "ruflo@latest", "mcp", "start"]
    }
  }
}
```

## Connecting to Codex CLI

```bash
codex mcp add ruflo -- npx ruflo@v3alpha mcp start

# Verify
codex mcp list
```
