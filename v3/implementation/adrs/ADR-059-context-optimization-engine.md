# ADR-059: Context Window Optimization Engine

**Status:** Proposed
**Date:** 2026-03-02
**Supersedes:** None
**Related:** ADR-001 (Agent Implementation), ADR-006 (Unified Memory), ADR-009 (Hybrid Memory Backend)

## Context

Claude Code's 200K token context window is a shared, finite resource. Every MCP tool call injects raw output directly into this window. In practice:

- A single Playwright snapshot: **56 KB** consumed
- 20 GitHub issues fetched: **59 KB** consumed
- 500-line access log: **45 KB** consumed
- Typical session depletion: **~40% in 30 minutes**

For claude-flow's multi-agent swarms, this problem compounds multiplicatively. An 8-agent hierarchical swarm can exhaust the effective context window in under 15 minutes of active tool use. This makes long-running tasks (feature implementation, security audits, refactoring) fragile and prone to quality degradation as context fills.

The open-source project [claude-context-mode](https://github.com/mksglu/claude-context-mode) by Mert Koseoglu demonstrates a proven approach: sandbox-isolated execution that compresses tool output by 95-98% before it enters context, extending sessions from ~30 minutes to ~3 hours.

## Decision

We will build a native **Context Optimization Engine** as a new bounded context (`@claude-flow/context`) that integrates the core mechanisms from claude-context-mode into the claude-flow/ruflo platform. Specifically:

### 1. Compression Pipeline

A multi-stage pipeline intercepts MCP tool outputs:

```
Raw Output → Size Check → Sandbox Isolation → Intent Filter → Smart Snippet → Compressed Output
```

- **Small outputs (<1 KB)** pass through unchanged
- **Medium outputs (1-5 KB)** receive smart snippet extraction
- **Large outputs (>5 KB)** receive full pipeline treatment: sandbox isolation + intent-driven filtering + snippet extraction

### 2. Knowledge Base (FTS5 + HNSW)

A dual-index knowledge base stores full tool outputs locally:

- **SQLite FTS5** for full-text search with BM25 ranking and Porter stemming
- **HNSW** (via existing `@claude-flow/memory`) for semantic vector search
- **Three-layer fuzzy search**: stemming → trigram substring → Levenshtein correction

This means raw data is never lost — it's indexed and searchable on demand, but only summaries enter the context window.

### 3. Hook-Based Integration

Integration uses claude-flow's existing hook system:

- **PreToolUse hook** intercepts tool calls and injects compression routing
- **PostToolUse hook** processes outputs through the compression pipeline
- **SubagentRouting hook** automatically teaches spawned agents to use batch operations

### 4. Sandbox Pool

Process-isolated execution environments for safe code execution:

- Credential passthrough via environment variable allowlisting
- Support for 11 runtimes (JS, TS, Python, Shell, Ruby, Go, Rust, PHP, Perl, R, Elixir)
- Bun auto-detection for 3-5x faster JS/TS execution
- Pool-based lifecycle management with warm starts

### 5. Swarm-Aware Context Budgets

Per-agent context allocation for multi-agent scenarios:

- Each agent receives a context budget based on swarm topology
- Progressive throttling encourages batch operations (calls 1-3: normal, 4-8: reduced, 9+: blocked)
- Cross-agent knowledge sharing via shared FTS5 index

## Rationale

### Why Native Integration (Not External Plugin)

| Approach | Pros | Cons |
|----------|------|------|
| External MCP server (status quo) | Easy to add | No swarm awareness, no shared knowledge, no agent budgets |
| Plugin (`@claude-flow/plugin-context`) | Pluggable | Limited hook access, no deep memory integration |
| **Native package (`@claude-flow/context`)** | **Full hook access, HNSW integration, swarm-aware, agent budgets** | More code to maintain |

Native integration is chosen because:

1. **Swarm multiplier**: Context savings compound across all agents in a swarm
2. **Memory synergy**: Reuses existing HNSW infrastructure from `@claude-flow/memory`
3. **Hook depth**: PreToolUse hooks require deep integration with the hook chain
4. **Agent budgets**: Per-agent context allocation requires swarm topology awareness

### Why FTS5 + HNSW (Dual Index)

- **FTS5** excels at keyword-based search with BM25 relevance ranking — fast for exact terms
- **HNSW** excels at semantic similarity — finding conceptually related content even with different terminology
- Combined, they provide both precision (FTS5) and recall (HNSW) for knowledge retrieval

### Alternatives Considered

1. **Token-level compression (gzip/brotli on text)**: Rejected — saves bytes but not tokens; Claude still processes the full text
2. **LLM-based summarization**: Rejected — adds latency and costs; the sandbox approach is faster and free
3. **Static truncation**: Rejected — loses tail content arbitrarily; smart snippets preserve relevant sections
4. **Context window extension (waiting for larger windows)**: Rejected — not actionable; even 1M windows would benefit from compression

## Consequences

### Positive

- **Session duration**: ~30 min → ~3 hours before quality degradation
- **Swarm efficiency**: 8-agent swarms can sustain multi-hour workflows
- **Zero data loss**: Full outputs indexed and searchable locally
- **Backward compatible**: Feature-flagged, opt-in, no breaking changes
- **Reuses infrastructure**: HNSW, hooks, and AgentDB already exist

### Negative

- **New package to maintain**: `@claude-flow/context` adds surface area
- **Sandbox security surface**: Process isolation must be hardened
- **FTS5 disk usage**: Index grows over session lifetime (mitigated by TTL eviction)
- **Learning curve**: Teams must understand compression thresholds and search APIs

## Implementation

### Package Structure

```
v3/@claude-flow/context/
├── src/
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── CompressedOutput.ts
│   │   │   ├── KnowledgeChunk.ts
│   │   │   └── SandboxInstance.ts
│   │   ├── value-objects/
│   │   │   ├── CompressionRatio.ts
│   │   │   ├── ContextBudget.ts
│   │   │   ├── SearchQuery.ts
│   │   │   └── SnippetWindow.ts
│   │   ├── aggregates/
│   │   │   ├── CompressionSession.ts
│   │   │   └── KnowledgeBase.ts
│   │   ├── services/
│   │   │   ├── CompressionPipelineService.ts
│   │   │   ├── KnowledgeIndexService.ts
│   │   │   ├── FuzzySearchService.ts
│   │   │   └── SandboxPoolService.ts
│   │   └── events/
│   │       ├── OutputCompressed.ts
│   │       ├── ContentIndexed.ts
│   │       └── BudgetExceeded.ts
│   ├── infrastructure/
│   │   ├── FTS5Repository.ts
│   │   ├── HNSWSearchAdapter.ts
│   │   ├── SandboxProcessManager.ts
│   │   └── MetricsCollector.ts
│   ├── application/
│   │   ├── CompressCommand.ts
│   │   ├── SearchCommand.ts
│   │   ├── IndexCommand.ts
│   │   └── BatchExecuteCommand.ts
│   └── hooks/
│       ├── PreToolUseHook.ts
│       ├── PostToolUseHook.ts
│       └── SubagentRoutingHook.ts
├── tests/
├── package.json
└── tsconfig.json
```

### Key Interfaces

```typescript
interface ICompressionPipeline {
  compress(output: RawToolOutput, options: CompressionOptions): Promise<CompressedOutput>;
  getStats(): SessionCompressionStats;
  reset(): void;
}

interface IKnowledgeBase {
  index(content: string, metadata: ChunkMetadata): Promise<IndexResult>;
  search(queries: string[], options?: SearchOptions): Promise<SearchResult[]>;
  fetchAndIndex(url: string): Promise<IndexResult>;
}

interface ISandboxPool {
  acquire(runtime: RuntimeType): Promise<SandboxInstance>;
  release(sandbox: SandboxInstance): void;
  execute(code: string, runtime: RuntimeType): Promise<ExecutionResult>;
}

interface IContextBudgetManager {
  allocate(agentId: string, budget: ContextBudget): void;
  consume(agentId: string, tokens: number): boolean;
  getRemaining(agentId: string): ContextBudget;
  throttle(agentId: string): ThrottleLevel;
}
```

## Success Criteria

| Metric | Target |
|--------|--------|
| Average context reduction | ≥95% |
| Session duration extension | ≥2.5 hours |
| Compression latency (P99) | <50ms |
| Knowledge search latency | <10ms |
| Swarm aggregate savings | ≥90% |
| Backward compatibility | 100% |

## References

- [claude-context-mode](https://github.com/mksglu/claude-context-mode) — Prior art by Mert Koseoglu
- ADR-001: Agent Implementation (delegation pattern)
- ADR-006: Unified Memory Service (HNSW foundation)
- ADR-009: Hybrid Memory Backend (SQLite + AgentDB)
- ADR-026: 3-Tier Model Routing (cost optimization synergy)
