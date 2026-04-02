# Quick Start

Get Ruflo running in under 2 minutes.

## 1. Initialize a Project

```bash
npx ruflo@latest init
```

This runs the setup wizard and creates:

- `CLAUDE.md` — agent instructions for Claude Code
- `.claude/` — skills, agents, hooks, and memory

## 2. Start the MCP Server

```bash
npx ruflo@latest mcp start
```

Or add it permanently to Claude Code:

```bash
claude mcp add ruflo -- npx -y ruflo@latest mcp start
claude mcp list  # verify
```

## 3. Run Your First Task

Inside a Claude Code session (or via CLI):

```bash
# Spawn a coder agent
npx ruflo@latest --agent coder --task "Implement user authentication with JWT"

# List all available agents
npx ruflo@latest --list
```

## 4. Use the Swarm

For complex, multi-step tasks, initialize a swarm:

```bash
# In Claude Code, after MCP is connected:
# swarm_init(topology="hierarchical", maxAgents=6, strategy="specialized")
```

---

## What Happens Automatically

Once initialized, Ruflo's hook system runs invisibly in the background:

- **Routes tasks** to the right agent based on complexity
- **Stores successful patterns** in vector memory (HNSW)
- **Skips the LLM** for simple transforms using WASM (352x faster, $0)
- **Learns** from every session to improve future routing

> You don't need to learn 259 MCP tools or 26 CLI commands. Just use Claude Code normally — the hooks system handles coordination.

---

## Verify Everything Works

```bash
npx ruflo@latest hooks intelligence --status
```

Expected output includes active agents, memory stats, and routing accuracy.

---

→ [Claude Code Integration](claude-code.md)  
→ [Architecture Overview](../architecture/overview.md)
