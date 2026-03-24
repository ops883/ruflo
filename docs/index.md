# 🌊 Ruflo

**The leading agent orchestration platform for Claude.**

Deploy intelligent multi-agent swarms, coordinate autonomous workflows, and build conversational AI systems. Features enterprise-grade architecture, distributed swarm intelligence, RAG integration, and native Claude Code / Codex integration.

---

## What is Ruflo?

Ruflo (formerly Claude Flow) is a comprehensive AI agent orchestration framework that transforms Claude Code into a powerful multi-agent development platform. Teams use it to deploy, coordinate, and optimize 60+ specialized AI agents working together on complex software engineering tasks.

> **Why Ruflo?** Named by Ruv — the "Ru" is the Ruv, the "flo" is the flow. Underneath, WASM kernels written in Rust power the policy engine, embeddings, and proof system. 5,900+ commits later, the alpha is over. This is v3.5.

```bash
# Get started immediately
npx ruflo@latest init --wizard
```

---

## Key Capabilities

### 🤖 60+ Specialized Agents
Ready-to-use AI agents for coding, code review, testing, security audits, documentation, and DevOps — each optimized for its specific role.

### 🐝 Coordinated Agent Swarms
Run unlimited agents simultaneously. Agents spawn sub-workers, communicate, share context, and divide work automatically using hierarchical (queen/workers) or mesh (peer-to-peer) patterns.

### 🧠 Self-Learning System
The system remembers what works. Successful patterns are stored and reused, routing similar tasks to the best-performing agents — gets smarter over time.

### 🔌 Any LLM, Native MCP
Switch between Claude, GPT, Gemini, Cohere, or local models like Llama. Native MCP integration means you use Ruflo directly inside Claude Code.

### ⚡ 3-Tier Cost Optimization
Simple code transforms run in WASM (<1ms, $0). Medium tasks route to cheaper models. Only complex reasoning uses Opus. Net result: **75% lower API costs** and **2.5x more tasks** within your quota.

### 🔒 Production-Ready Security
CVE-hardened with bcrypt, input validation, path traversal prevention, and built-in AIDefence threat detection (<10ms).

---

## Architecture at a Glance

```
User → Ruflo (CLI/MCP) → Router → Swarm → Agents → Memory → LLM Providers
                       ↑                          ↓
                       └──── Learning Loop ←──────┘
```

See [Architecture Overview](architecture/overview.md) for the full system diagram.

---

## Quick Start

```bash
# One-line install (recommended)
curl -fsSL https://cdn.jsdelivr.net/gh/ruvnet/claude-flow@main/scripts/install.sh | bash

# Or via npx
npx ruflo@latest init

# Add to Claude Code as an MCP server
claude mcp add ruflo -- npx -y ruflo@latest mcp start
```

→ [Full installation guide](getting-started/installation.md)

---

## Ruflo vs. Alternatives

| Feature | Ruflo v3 | CrewAI | LangGraph | AutoGen |
|---------|----------|--------|-----------|---------|
| Self-Learning (SONA + EWC++) | ✅ | ⛔ | ⛔ | ⛔ |
| Vector Memory (HNSW sub-ms) | ✅ | ⛔ | Via plugins | ⛔ |
| Swarm Topologies | ✅ 4 types | 1 | 1 | 1 |
| Consensus Protocols | ✅ 5 (Raft, BFT…) | ⛔ | ⛔ | ⛔ |
| MCP Integration | ✅ 259 tools | ⛔ | ⛔ | ⛔ |
| Multi-Provider LLM | ✅ 6 + failover | 2 | 3 | 2 |
| WASM Code Transforms | ✅ <1ms, $0 | ⛔ | ⛔ | ⛔ |

---

## For AI / LLM Consumers

This site publishes machine-readable documentation:

- `/llms.txt` — curated index following the [llmstxt.org](https://llmstxt.org/) spec
- `/llms-full.txt` — all docs in one file, ideal for LLM context windows
- Per-page `.md` files at the same URL path as each HTML page

---

## License

Ruflo is [MIT licensed](https://github.com/ruvnet/ruflo/blob/main/LICENSE).
