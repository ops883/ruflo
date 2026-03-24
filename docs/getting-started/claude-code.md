# Claude Code Integration

Ruflo was built first and foremost for Claude Code. This page covers how the integration works and how to get the most out of it.

## How it Works

Ruflo installs as an MCP (Model Context Protocol) server that Claude Code can call. It also injects hooks into the Claude Code lifecycle:

```
Claude Code → pre-task hook → Ruflo Router → Agent(s) → Memory → LLM
                                           ↑
                                    (WASM for simple tasks)
```

## Add Ruflo to Claude Code

```bash
# One-time setup
claude mcp add ruflo -- npx -y ruflo@latest mcp start

# Verify
claude mcp list
```

Once added, all 259 Ruflo MCP tools are available directly in Claude Code sessions.

## Key MCP Tools

| Tool | Purpose |
|------|---------|
| `swarm_init` | Initialize an agent swarm |
| `agent_spawn` | Register and spawn a specialized agent |
| `memory_search` | Semantic vector search over learned patterns |
| `memory_store` | Persist a pattern for future use |
| `hooks_route` | Manually trigger intelligent task routing |
| `neural_train` | Train on accumulated patterns |

## Self-Learning Workflow

```
1. LEARN:    memory_search(query) → retrieve relevant patterns
2. COORD:    swarm_init(topology="hierarchical") → set up agents
3. EXECUTE:  Claude Code writes code / runs commands
4. REMEMBER: memory_store(key, value, namespace="patterns") → persist
```

The **Intelligence Loop** automates this cycle via hooks — every session builds the knowledge graph, injects ranked context into routing decisions, and boosts confidence for patterns that work.

## Codex / Dual-Mode

Ruflo also supports **OpenAI Codex CLI** via `@claude-flow/codex`:

```bash
# Init for Codex CLI (creates AGENTS.md instead of CLAUDE.md)
npx ruflo@latest init --codex

# Dual mode (both platforms)
npx ruflo@latest init --dual
```

In dual mode:

```
Claude Code (interactive)  ←→  Codex Workers (headless, parallel)
- Main conversation              - Bulk code generation
- Architecture decisions         - Test execution
- Complex reasoning              - File processing
```

Parallel Codex workers deliver **4-8x speed** for bulk tasks and allow cost routing to cheaper workers.

## Hooks Reference

Ruflo injects three key hooks into Claude Code:

| Hook | When it fires | What it does |
|------|---------------|--------------|
| `pre-task` | Before a task starts | Analyzes complexity, routes to WASM/agent/swarm |
| `post-task` | After task completes | Stores successful patterns, updates knowledge graph |
| `progress` | During long tasks | Validates spec compliance, checks ADR drift |

## Troubleshooting

```bash
# Run diagnostics
npx ruflo@latest --doctor

# Check hook status
npx ruflo@latest hooks intelligence --status

# Re-initialize (safe, preserves memory)
npx ruflo@latest init upgrade
```
