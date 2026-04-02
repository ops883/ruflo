# Ruflo — Claude Code Passthrough Setup

Modified version of Ruflo (Claude Flow) that routes LLM calls through your Claude Code subscription instead of requiring a separate Anthropic API key.

## Prerequisites

- Node.js 20+
- npm 9+
- Claude Code installed and logged in (subscription active)

## Setup on a New Machine

### 1. Install dependencies and build

```bash
cd ~/Documents/ruflo/v2
npm install --legacy-peer-deps
npx swc src -d dist --config-file .swcrc
npm link
```

### 2. Configure a project to use Ruflo

In any project directory, create `.mcp.json`:

```json
{
  "mcpServers": {
    "claude-flow": {
      "command": "node",
      "args": ["<full-path-to>/ruflo/v2/bin/claude-flow.js", "mcp", "start"],
      "type": "stdio"
    }
  }
}
```

Replace `<full-path-to>` with the actual path, e.g. `/Users/yourname/Documents/ruflo/v2/bin/claude-flow.js`.

### 3. Start Claude Code

Open Claude Code in that project directory. It picks up `.mcp.json` automatically and connects to the Ruflo MCP server.

**Do not set `ANTHROPIC_API_KEY`** — with no key present, the passthrough adapter activates and routes all LLM calls through your Claude Code subscription.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | If set, Ruflo uses direct API (original behaviour). If unset, passthrough activates. |
| `RUFLO_USE_CLAUDE_CODE_AUTH=1` | Force passthrough mode even when an API key is present. |

## How It Works

When no API key is detected, the `ClaudeFlowSDKAdapter` automatically swaps in a `ClaudeCodePassthroughAdapter` that routes LLM calls through the Claude Code SDK's `query()` function. This function inherits authentication from your active Claude Code subscription — no separate API key or billing required.

The detection is automatic:
- API key present → direct Anthropic API (faster, original behaviour)
- No API key → Claude Code passthrough (uses subscription auth)
- `RUFLO_USE_CLAUDE_CODE_AUTH=1` → passthrough regardless

## Modified Files

| File | Change |
|------|--------|
| `v2/src/sdk/claude-code-passthrough.ts` | **New file** — the passthrough adapter |
| `v2/src/sdk/sdk-config.ts` | Auto-detects missing key, routes to passthrough |
| `v2/src/api/claude-client-v2.5.ts` | Made `apiKey` optional |
| `v2/src/swarm/executor-sdk.ts` | Removed forced `apiKey!` assertion |
| `v2/src/memory/*.js` (7 stub files) | Fixed pre-existing missing module references |

## Troubleshooting

**MCP server won't start:**
Ensure dependencies are installed (`npm install --legacy-peer-deps`) and the project is built (`npx swc src -d dist --config-file .swcrc`).

**"Claude Code SDK not available" error:**
The passthrough only works when Ruflo runs as an MCP server inside a Claude Code session. It cannot work standalone — Claude Code must be the parent process.

**Want to use a direct API key instead:**
Set `ANTHROPIC_API_KEY` in your environment or `.env` file. The passthrough will automatically deactivate.
