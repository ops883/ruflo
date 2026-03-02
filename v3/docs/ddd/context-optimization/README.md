# Context Optimization Bounded Context

## Strategic Overview

The Context Optimization bounded context is responsible for managing the finite context window as a shared resource across claude-flow sessions and multi-agent swarms. It treats **context capacity as a first-class domain concept** — allocating, compressing, indexing, and tracking token usage to maximize the useful lifetime of every session.

## Problem Domain

Claude Code sessions operate within a 200K token context window. Every MCP tool call injects raw output directly into this window. Without optimization, typical sessions degrade after ~30 minutes of active tool use. In multi-agent swarms, this problem compounds multiplicatively.

## Ubiquitous Language

| Term | Definition |
|------|-----------|
| **Context Window** | The finite 200K token space shared by all participants in a Claude Code session |
| **Raw Output** | Uncompressed tool output before processing by the compression pipeline |
| **Compressed Output** | Tool output after processing — only this enters the context window |
| **Compression Ratio** | `1 - (compressed_size / raw_size)` — target ≥0.95 |
| **Context Budget** | Token allocation assigned to a specific agent within a swarm |
| **Knowledge Chunk** | A heading-bounded segment of indexed content stored in the knowledge base |
| **Smart Snippet** | A contextual window extracted around matched terms (not arbitrary truncation) |
| **Throttle Level** | Progressive restriction on tool output size (normal → reduced → minimal → blocked) |
| **Sandbox** | Process-isolated execution environment for running code without context leakage |
| **Intent** | Optional hint describing what information the agent seeks (guides filtering) |
| **Match Layer** | Which search strategy found a result (stemming, trigram, or fuzzy) |
| **Session Scope** | TTL boundary for knowledge base entries — auto-evicted after session ends |

## Context Map

```
┌──────────────────────────────────────────────────────────────────┐
│                    Claude Flow V3 Ecosystem                       │
│                                                                   │
│  ┌─────────────────┐         ┌──────────────────────────┐       │
│  │  Agent Lifecycle  │◀──────▶│  Context Optimization     │       │
│  │  (ADR-001)       │ budget  │  (@claude-flow/context)   │       │
│  │                  │ alloc   │                           │       │
│  │  spawn, execute, │         │  compress, index, search, │       │
│  │  shutdown        │         │  sandbox, throttle        │       │
│  └────────┬────────┘         └────────────┬──────────────┘       │
│           │                                │                      │
│           │ delegates                      │ stores/queries       │
│           ▼                                ▼                      │
│  ┌─────────────────┐         ┌──────────────────────────┐       │
│  │  Memory System   │◀──────▶│  Hook System              │       │
│  │  (ADR-006/009)   │ HNSW   │  (@claude-flow/hooks)     │       │
│  │                  │ search  │                           │       │
│  │  AgentDB, HNSW,  │         │  PreToolUse, PostToolUse, │       │
│  │  SQLite          │         │  SubagentRouting          │       │
│  └─────────────────┘         └──────────────────────────┘       │
│                                                                   │
│  ┌─────────────────┐         ┌──────────────────────────┐       │
│  │  Swarm Coord     │◀──────▶│  Security                 │       │
│  │  (Hierarchical)  │ topo   │  (@claude-flow/security)  │       │
│  │                  │ aware  │                           │       │
│  │  topology,       │         │  credential allowlist,    │       │
│  │  agent registry  │         │  input validation         │       │
│  └─────────────────┘         └──────────────────────────┘       │
└──────────────────────────────────────────────────────────────────┘
```

### Integration Relationships

| Upstream Context | Relationship | Integration Pattern |
|-----------------|-------------|-------------------|
| Agent Lifecycle | Conformist | Budget manager conforms to agent spawn/shutdown events |
| Hook System | Partnership | Mutual integration — hooks trigger compression, compression hooks into pipeline |

| Downstream Context | Relationship | Integration Pattern |
|-------------------|-------------|-------------------|
| Memory System | Customer-Supplier | Context uses HNSW for semantic search; Memory supplies the index |
| Swarm Coordinator | Customer-Supplier | Context queries topology for budget allocation; Swarm supplies topology info |
| Security | Conformist | Context conforms to credential allowlist and input validation rules |

### Anti-Corruption Layers

- **HNSW Adapter**: Wraps `@claude-flow/memory` HNSW search to present a unified search interface alongside FTS5
- **Swarm Topology Adapter**: Translates swarm topology events into budget allocation decisions
- **Hook Bridge**: Adapts hook lifecycle events into compression pipeline triggers

## Aggregate Roots

### 1. CompressionSession (Aggregate Root)

The central aggregate managing all context optimization for a single session.

```
CompressionSession
├── sessionId: SessionId
├── startedAt: Timestamp
├── totalRawBytes: number
├── totalCompressedBytes: number
├── compressionRatio: CompressionRatio
├── toolStats: Map<ToolName, ToolCompressionStats>
├── budgetManager: ContextBudgetManager (if swarm)
└── knowledgeBase: KnowledgeBase
```

**Invariants:**
- Compression ratio must remain ≥0.90 over any rolling 10-minute window
- Total compressed output must not exceed available context budget
- Session must track per-tool statistics for observability

### 2. KnowledgeBase (Aggregate Root)

Manages the dual-index (FTS5 + HNSW) searchable store of full tool outputs.

```
KnowledgeBase
├── sessionId: SessionId
├── fts5Store: FTS5Store
├── hnswAdapter: HNSWSearchAdapter
├── chunks: KnowledgeChunk[]
├── totalChunks: number
├── totalSizeBytes: number
└── evictionPolicy: TTLEvictionPolicy
```

**Invariants:**
- Chunks must not exceed maxChunkSize (2048 tokens)
- Duplicate content (by hash) must be deduplicated
- Expired chunks (past TTL) must be evicted before search

## Related ADRs

- [ADR-059: Context Optimization Engine](../../implementation/adrs/ADR-059-context-optimization-engine.md)
- [ADR-059a: FTS5 Knowledge Base](../../implementation/adrs/ADR-059a-fts5-knowledge-base.md)
- [ADR-059b: Sandbox Isolation](../../implementation/adrs/ADR-059b-sandbox-isolation.md)
- [ADR-059c: Swarm Context Budgets](../../implementation/adrs/ADR-059c-swarm-context-budgets.md)
