# ADR-059c: Swarm-Aware Context Budgets and Progressive Throttling

**Status:** Proposed
**Date:** 2026-03-02
**Parent:** ADR-059 (Context Optimization Engine)
**Related:** ADR-001 (Agent Implementation), ADR-026 (3-Tier Model Routing)

## Context

In a multi-agent swarm, context consumption is multiplicative. An 8-agent hierarchical swarm where each agent independently makes MCP tool calls can exhaust the shared context window far faster than a single-agent session. There is currently no mechanism to:

1. Allocate context budgets to individual agents within a swarm
2. Throttle agents that consume disproportionate context
3. Encourage efficient tool usage patterns (batching over sequential calls)
4. Share indexed knowledge across agents to avoid redundant fetches

## Decision

We will implement a **context budget manager** that integrates with the swarm coordinator to allocate, track, and enforce per-agent context budgets with progressive throttling.

### Budget Allocation Strategy

```
Total Context Window: 200K tokens
├── Reserved (system prompt, conversation): 40K (20%)
├── Available for Tool Outputs: 160K (80%)
│   ├── Shared Knowledge Base: 20K (12.5% of available)
│   └── Agent Budgets: 140K (87.5% of available)
│       ├── Coordinator: 25K (17.9%)
│       ├── Architect: 25K (17.9%)
│       ├── Coder 1: 20K (14.3%)
│       ├── Coder 2: 20K (14.3%)
│       ├── Tester: 20K (14.3%)
│       ├── Reviewer: 15K (10.7%)
│       └── Buffer (reallocation): 15K (10.7%)
```

Budget allocation is **topology-aware**:

| Topology | Allocation Strategy |
|----------|-------------------|
| Hierarchical | Coordinator gets 1.5x base; workers get equal shares |
| Mesh | Equal distribution across all agents |
| Adaptive | Dynamic reallocation based on active task complexity |

### Progressive Throttling

Agents that approach their budget limits are progressively throttled:

```typescript
enum ThrottleLevel {
  NORMAL = 'normal',      // Calls 1-3: Full results (2 results/query)
  REDUCED = 'reduced',    // Calls 4-8: Reduced results (1 result/query) + warning
  MINIMAL = 'minimal',    // Calls 9-12: Minimal results + strong warning
  BLOCKED = 'blocked',    // Calls 13+: Blocked; must use batch_execute
}

interface ThrottlePolicy {
  level: ThrottleLevel;
  maxResultsPerQuery: number;
  warningMessage: string | null;
  suggestBatch: boolean;
  requireBatch: boolean;
}
```

Throttling resets when an agent uses `batch_execute` (rewarding efficient patterns).

### Cross-Agent Knowledge Sharing

When one agent indexes content into the FTS5 knowledge base, all agents in the swarm can search it:

```typescript
interface SharedKnowledge {
  // Agent A indexes GitHub issues
  index(content: string, meta: { agent: string; tool: string }): void;

  // Agent B searches without re-fetching
  search(query: string, options?: { excludeAgent?: string }): SearchResult[];

  // Deduplication: skip indexing if content hash already exists
  hasContent(hash: string): boolean;
}
```

This prevents redundant tool calls. If Agent A fetches and indexes 20 GitHub issues, Agent B can search the indexed results instead of making the same API call.

### Budget Reallocation

When an agent completes its task or goes idle, its remaining budget is redistributed:

```typescript
interface IBudgetManager {
  allocate(agentId: string, tokens: number): void;
  consume(agentId: string, tokens: number): ConsumeResult;
  release(agentId: string): ReleaseResult;     // Agent done → redistribute
  rebalance(): void;                             // Periodic rebalance
  getSnapshot(): BudgetSnapshot;                 // Current state for all agents
}

interface ConsumeResult {
  allowed: boolean;
  throttleLevel: ThrottleLevel;
  remaining: number;
  suggestion: string | null;  // e.g., "Use batch_execute to reset throttle"
}
```

### Integration with Swarm Coordinator

The budget manager hooks into the existing swarm lifecycle:

```
Swarm Init
  └─▶ BudgetManager.initialize(topology, agentCount)
       └─▶ Allocate budgets per topology strategy

Agent Spawn
  └─▶ BudgetManager.allocate(agentId, budgetTokens)

Tool Call (via PreToolUse hook)
  └─▶ BudgetManager.checkBudget(agentId)
       ├─▶ NORMAL: proceed
       ├─▶ REDUCED: proceed with warning
       ├─▶ MINIMAL: proceed with strong warning
       └─▶ BLOCKED: reject, suggest batch_execute

Tool Output (via PostToolUse hook)
  └─▶ BudgetManager.consume(agentId, outputTokens)
  └─▶ KnowledgeBase.index(output, { agent: agentId })

Agent Complete
  └─▶ BudgetManager.release(agentId)
       └─▶ Redistribute to active agents
```

## Rationale

### Why Per-Agent Budgets (Not Global Pool)

A global pool allows a single chatty agent to starve all others. Per-agent budgets ensure fair resource distribution and make it visible when a specific agent is consuming disproportionate context. The reallocation mechanism still allows flexibility — budgets flow to where they're needed.

### Why Progressive Throttling (Not Hard Cutoff)

Hard cutoffs break agent workflows mid-task. Progressive throttling:
1. **Educates**: Warnings teach agents about efficient patterns
2. **Degrades gracefully**: Reduced results are still useful
3. **Provides escape hatch**: `batch_execute` resets the throttle
4. **Preserves agency**: Agents can still function, just with less data per call

### Why Shared Knowledge (Not Agent-Isolated)

Agent-isolated knowledge bases lead to redundant API calls. In a typical feature-dev swarm:
- Architect fetches repo structure
- Coder fetches the same files
- Tester fetches the same test files
- Reviewer fetches the same changed files

Shared knowledge eliminates 3x redundant fetches in this scenario.

## Consequences

### Positive

- Fair context distribution prevents single-agent starvation
- Progressive throttling encourages efficient tool usage patterns
- Shared knowledge eliminates redundant cross-agent tool calls
- Dynamic reallocation adapts to changing workload patterns
- Topology-aware allocation matches agent roles to budget needs

### Negative

- Budget tracking adds per-tool-call overhead (~1ms)
- Throttling may slow agents that legitimately need many sequential calls
- Shared knowledge index grows with agent count (mitigated by dedup)
- Reallocation requires atomic operations to prevent race conditions

## Success Criteria

| Metric | Target |
|--------|--------|
| Per-agent budget enforcement accuracy | 100% |
| Throttle response latency | <1ms |
| Cross-agent knowledge deduplication | ≥50% fewer redundant calls |
| Budget reallocation latency | <5ms |
| Aggregate swarm context savings | ≥90% |

## References

- ADR-059: Context Optimization Engine (parent)
- ADR-059a: FTS5 Knowledge Base (search infrastructure)
- ADR-001: Agent Implementation (agent lifecycle)
- ADR-026: 3-Tier Model Routing (cost optimization synergy)
