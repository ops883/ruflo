# Context Optimization Integration Points

## Overview

This document describes how the Context Optimization bounded context integrates with other Claude Flow V3 domains. Each integration point specifies the relationship type, data flow direction, and contract.

---

## 1. Hook System (`@claude-flow/hooks`)

**Relationship:** Partnership (bidirectional)
**Integration Pattern:** Event-driven hooks

### PreToolUse Hook

Intercepts tool calls before execution to inject compression routing instructions.

```typescript
// Hook registration
hookRegistry.register('PreToolUse', {
  name: 'context-optimization-pre',
  priority: 10, // Run early in the hook chain
  handler: async (event: PreToolUseEvent) => {
    const budget = budgetManager.checkBudget(event.agentId);

    if (budget.throttleLevel === ThrottleLevel.BLOCKED) {
      return {
        action: 'suggest_alternative',
        message: 'Context budget exceeded. Use batch_execute to continue.',
        suggestedTool: 'batch_execute',
      };
    }

    // Inject compression intent if available
    if (event.toolArgs?.intent) {
      compressionPipeline.setIntent(event.toolArgs.intent);
    }

    return { action: 'proceed' };
  },
});
```

### PostToolUse Hook

Processes tool outputs through the compression pipeline.

```typescript
hookRegistry.register('PostToolUse', {
  name: 'context-optimization-post',
  priority: 5, // Run early to compress before other hooks see output
  handler: async (event: PostToolUseEvent) => {
    const compressed = await compressionPipeline.compress(
      { content: event.output, toolName: event.toolName, sizeBytes: event.outputSize },
      { intent: currentIntent, maxTokens: DEFAULT_MAX_TOKENS }
    );

    // Index full output in knowledge base
    await knowledgeBase.index(event.output, {
      toolName: event.toolName,
      agentId: event.agentId,
    });

    // Return compressed version for context
    return { output: compressed.content };
  },
});
```

### SubagentRouting Hook

Automatically teaches spawned subagents to use compressed operations.

```typescript
hookRegistry.register('PreToolUse', {
  name: 'context-subagent-routing',
  priority: 20,
  filter: (event) => event.toolName === 'Agent' || event.toolName === 'Task',
  handler: async (event: PreToolUseEvent) => {
    // Inject context-optimization instructions into subagent prompt
    const routingInstructions = `
      IMPORTANT: Use batch_execute for multiple operations.
      Use search(queries: [...]) for multi-query knowledge retrieval.
      Avoid sequential single-tool calls when batching is possible.
    `;

    return {
      action: 'modify_args',
      modifiedArgs: {
        ...event.toolArgs,
        prompt: event.toolArgs.prompt + '\n\n' + routingInstructions,
      },
    };
  },
});
```

---

## 2. Memory System (`@claude-flow/memory`)

**Relationship:** Customer-Supplier (Context is customer, Memory is supplier)
**Integration Pattern:** Adapter

### HNSW Search Adapter

Wraps the existing HNSW vector search to provide semantic search alongside FTS5 keyword search.

```typescript
class HNSWSearchAdapter {
  constructor(private readonly memoryService: IMemoryService) {}

  async semanticSearch(query: string, limit: number = 5): Promise<SemanticSearchResult[]> {
    // Use existing HNSW infrastructure from @claude-flow/memory
    const results = await this.memoryService.search({
      query,
      namespace: 'context-knowledge',
      limit,
      includeMetadata: true,
    });

    return results.map(r => ({
      content: r.value,
      score: r.similarity,
      source: r.metadata?.source,
      matchLayer: 'semantic' as const,
    }));
  }

  async indexForSemantic(chunk: KnowledgeChunk): Promise<void> {
    await this.memoryService.store({
      namespace: 'context-knowledge',
      key: chunk.chunkId,
      value: chunk.content,
      metadata: {
        heading: chunk.heading,
        source: JSON.stringify(chunk.source),
        sessionId: chunk.sessionId,
      },
    });
  }
}
```

### Unified Search Interface

Combines FTS5 and HNSW results with rank fusion.

```typescript
class UnifiedSearchService {
  constructor(
    private readonly fuzzySearch: FuzzySearchService,
    private readonly hnswAdapter: HNSWSearchAdapter,
  ) {}

  async search(queries: string[], options?: UnifiedSearchOptions): Promise<UnifiedSearchResult[]> {
    const results: UnifiedSearchResult[] = [];

    for (const query of queries) {
      // Run keyword and semantic search in parallel
      const [keywordResults, semanticResults] = await Promise.all([
        this.fuzzySearch.search(SearchQuery.create(query), options),
        this.hnswAdapter.semanticSearch(query, options?.limit),
      ]);

      // Reciprocal Rank Fusion to combine results
      const fused = this.reciprocalRankFusion(keywordResults, semanticResults);
      results.push(...fused);
    }

    return results;
  }

  private reciprocalRankFusion(
    keyword: SearchResult[],
    semantic: SemanticSearchResult[],
    k: number = 60,
  ): UnifiedSearchResult[] {
    const scores = new Map<string, number>();

    keyword.forEach((r, i) => {
      const id = r.chunkId;
      scores.set(id, (scores.get(id) || 0) + 1 / (k + i + 1));
    });

    semantic.forEach((r, i) => {
      const id = r.chunkId || r.content.substring(0, 50);
      scores.set(id, (scores.get(id) || 0) + 1 / (k + i + 1));
    });

    // Sort by fused score descending
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, score]) => ({ id, fusedScore: score }));
  }
}
```

---

## 3. Swarm Coordinator

**Relationship:** Customer-Supplier (Context is customer, Swarm is supplier)
**Integration Pattern:** Event subscription

### Topology-Aware Budget Allocation

```typescript
class SwarmBudgetIntegration {
  constructor(
    private readonly budgetManager: IContextBudgetManager,
    private readonly swarmEvents: ISwarmEventBus,
  ) {
    // Subscribe to swarm lifecycle events
    this.swarmEvents.on('swarm:initialized', this.onSwarmInit.bind(this));
    this.swarmEvents.on('agent:spawned', this.onAgentSpawned.bind(this));
    this.swarmEvents.on('agent:completed', this.onAgentCompleted.bind(this));
    this.swarmEvents.on('agent:shutdown', this.onAgentShutdown.bind(this));
  }

  private onSwarmInit(event: SwarmInitEvent): void {
    const totalBudget = AVAILABLE_CONTEXT_TOKENS;
    const allocation = this.computeAllocation(event.topology, event.agentCount, totalBudget);
    this.budgetManager.initializeSwarmBudgets(allocation);
  }

  private onAgentSpawned(event: AgentSpawnedEvent): void {
    const budget = this.budgetManager.getAllocation(event.agentId);
    if (!budget) {
      // Dynamic agent — allocate from buffer
      this.budgetManager.allocateFromBuffer(event.agentId);
    }
  }

  private onAgentCompleted(event: AgentCompletedEvent): void {
    // Release budget back to buffer for reallocation
    this.budgetManager.release(event.agentId);
  }

  private computeAllocation(
    topology: SwarmTopology,
    agentCount: number,
    totalTokens: number,
  ): Map<string, number> {
    const sharedKnowledgeReserve = Math.floor(totalTokens * 0.125);
    const bufferReserve = Math.floor(totalTokens * 0.107);
    const distributable = totalTokens - sharedKnowledgeReserve - bufferReserve;

    switch (topology) {
      case 'hierarchical':
        return this.hierarchicalAllocation(agentCount, distributable);
      case 'mesh':
        return this.equalAllocation(agentCount, distributable);
      case 'adaptive':
        return this.equalAllocation(agentCount, distributable); // Start equal, rebalance later
    }
  }

  private hierarchicalAllocation(agentCount: number, tokens: number): Map<string, number> {
    // Coordinator gets 1.5x share
    const baseShare = Math.floor(tokens / (agentCount + 0.5));
    const coordinatorShare = Math.floor(baseShare * 1.5);
    const workerShare = Math.floor((tokens - coordinatorShare) / (agentCount - 1));

    const allocation = new Map<string, number>();
    allocation.set('coordinator', coordinatorShare);
    for (let i = 1; i < agentCount; i++) {
      allocation.set(`worker-${i}`, workerShare);
    }
    return allocation;
  }
}
```

---

## 4. CLI (`@claude-flow/cli`)

**Relationship:** Customer-Supplier (CLI is customer, Context is supplier)
**Integration Pattern:** Command handlers

### New CLI Commands

```typescript
// context stats — Per-tool compression breakdown
registerCommand('context', 'stats', async () => {
  const session = await sessionRepo.getActiveSession();
  if (!session) return 'No active compression session.';

  const stats = session.getStats();
  return formatStatsTable(stats);
});

// context doctor — Diagnostic checks
registerCommand('context', 'doctor', async () => {
  const checks = await diagnosticService.runAll();
  return formatDiagnostics(checks);
});

// context search — Search knowledge base
registerCommand('context', 'search', async (args) => {
  const results = await unifiedSearch.search(args.queries);
  return formatSearchResults(results);
});
```

---

## 5. Security (`@claude-flow/security`)

**Relationship:** Conformist (Context conforms to Security rules)
**Integration Pattern:** Validation at boundary

### Credential Allowlist Integration

```typescript
class SecureCredentialPassthrough {
  constructor(private readonly securityConfig: ISecurityConfig) {}

  getPassthroughEnv(): Record<string, string> {
    const allowlist = this.securityConfig.getEnvAllowlist();
    const env: Record<string, string> = {};

    for (const key of allowlist) {
      if (process.env[key] !== undefined) {
        env[key] = process.env[key]!;
      }
    }

    return env;
  }

  validateSandboxOutput(output: string): ValidationResult {
    // Check for accidentally leaked secrets in sandbox stdout
    return this.securityConfig.getInputValidator().validateOutput(output);
  }
}
```

---

## Data Flow Summary

```
Tool Call
  │
  ├─▶ PreToolUse Hook ──▶ Budget Check ──▶ Throttle Decision
  │
  ▼
Tool Execution (external)
  │
  ▼
Raw Output
  │
  ├─▶ PostToolUse Hook ──▶ Compression Pipeline
  │                            │
  │                            ├─▶ Sandbox (process isolation)
  │                            ├─▶ Intent Filter (if intent provided)
  │                            ├─▶ Smart Snippet Extraction
  │                            └─▶ Metrics Recording
  │
  ├─▶ Knowledge Base Indexing
  │       ├─▶ FTS5 (keyword search)
  │       └─▶ HNSW (semantic search)
  │
  ▼
Compressed Output ──▶ Context Window (95-98% smaller)
```
