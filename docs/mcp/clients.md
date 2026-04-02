# MCP Client Setup

Quick-reference for connecting Ruflo's MCP server to popular clients.

## Client Compatibility

| Client | Support | Notes |
|--------|---------|-------|
| Claude Code (CLI) | ✅ Native | `claude mcp add` |
| Claude Desktop | ✅ | JSON config file |
| VS Code | ✅ | Requires v1.102+ |
| Cursor | ✅ | `.cursor/mcp.json` |
| Windsurf | ✅ | `.windsurf/mcp.json` |
| OpenAI Codex CLI | ✅ | `codex mcp add` |
| Any MCP client | ✅ | stdio transport |

## Claude Code (Recommended)

```bash
claude mcp add ruflo -- npx -y ruflo@latest mcp start
```

## Claude Desktop

```json
{
  "mcpServers": {
    "ruflo": {
      "command": "npx",
      "args": ["ruflo@v3alpha", "mcp", "start"],
      "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
    }
  }
}
```

## VS Code

Command Palette → **MCP: Add Server**:
```
npx ruflo@latest mcp start
```

## Cursor / Windsurf

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

## Codex CLI

```bash
codex mcp add ruflo -- npx ruflo@v3alpha mcp start
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes (for Claude) | Anthropic API key |
| `OPENAI_API_KEY` | Optional | For GPT provider |
| `GOOGLE_API_KEY` | Optional | For Gemini provider |
| `RUFLO_MAX_AGENTS` | Optional | Override default max agents |
| `RUFLO_LOG_LEVEL` | Optional | `debug` / `info` / `warn` / `error` |
