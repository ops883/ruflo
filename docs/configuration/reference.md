# Configuration Reference

## Documentation Site (`mkdocs.yml`)

This docs site is built with [MkDocs](https://www.mkdocs.org/) + [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) + [mkdocs-llms-source](https://github.com/TimChild/mkdocs-llms-source). See the [setup-from-scratch guide](https://TimChild.github.io/mkdocs-llms-source/setup-from-scratch/) for full mkdocs configuration options.

---

## Ruflo Project Configuration

After running `npx ruflo@latest init`, these files are created in your project:

### `CLAUDE.md`
The agent instruction file read by Claude Code at session start. Customise this to set project context, code style, and agent preferences.

### `.claude/settings.json`

```json
{
  "maxAgents": 8,
  "defaultTopology": "hierarchical",
  "defaultConsensus": "raft",
  "memoryNamespace": "default",
  "logLevel": "info",
  "enableWasm": true,
  "enableLearning": true
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `maxAgents` | `8` | Maximum concurrent agents in a swarm |
| `defaultTopology` | `hierarchical` | Default swarm topology |
| `defaultConsensus` | `raft` | Default consensus algorithm |
| `memoryNamespace` | `default` | Shared memory namespace for agents |
| `logLevel` | `info` | Log verbosity |
| `enableWasm` | `true` | Enable Agent Booster WASM transforms |
| `enableLearning` | `true` | Enable SONA self-learning |

### `.claude/agents/`
Custom agent definitions (YAML). See [Agent Catalog](../agents/catalog.md).

### `.claude/skills/`
137+ pre-built skills available as `/skill-name` (Claude Code) or `$skill-name` (Codex).

### `.claude/hooks/`
Pre/post/progress hook scripts. Ruflo installs default hooks — you can extend or replace them.

---

## MCP Server Configuration

Environment variables for `npx ruflo@latest mcp start`:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (required for Claude) |
| `OPENAI_API_KEY` | OpenAI API key |
| `GOOGLE_API_KEY` | Google Gemini API key |
| `RUFLO_MAX_AGENTS` | Override max agents |
| `RUFLO_LOG_LEVEL` | `debug` / `info` / `warn` / `error` |
| `RUFLO_MEMORY_PATH` | Custom path for AgentDB storage |
| `RUFLO_WASM_DISABLED` | Set to `1` to disable Agent Booster |
