# Context Optimization Domain Model

## Overview

This document defines the domain model for the Context Optimization bounded context, including entities, value objects, aggregates, domain services, and domain events that implement context window compression and knowledge indexing for Claude Flow V3.

## Core Domain Objects

### Value Objects

#### CompressionRatio

Represents the ratio of size reduction achieved by the compression pipeline.

```typescript
/**
 * Compression Ratio Value Object
 * Immutable scalar representing size reduction
 * Range: [0, 1] where 0 = no reduction, 1 = complete elimination
 */
class CompressionRatio {
  private readonly value: number;

  private constructor(value: number) {
    if (value < 0 || value > 1) {
      throw new Error('CompressionRatio must be between 0 and 1');
    }
    this.value = value;
  }

  static create(rawSize: number, compressedSize: number): CompressionRatio {
    if (rawSize === 0) return new CompressionRatio(0);
    return new CompressionRatio(1 - (compressedSize / rawSize));
  }

  static none(): CompressionRatio {
    return new CompressionRatio(0);
  }

  static maximum(): CompressionRatio {
    return new CompressionRatio(1);
  }

  getValue(): number {
    return this.value;
  }

  getPercentage(): number {
    return Math.round(this.value * 100);
  }

  meetsTarget(target: number = 0.95): boolean {
    return this.value >= target;
  }

  equals(other: CompressionRatio): boolean {
    return Math.abs(this.value - other.value) < 0.0001;
  }
}
```

#### ContextBudget

Represents a token allocation for a specific agent.

```typescript
/**
 * Context Budget Value Object
 * Immutable allocation of context tokens
 */
class ContextBudget {
  private readonly totalTokens: number;
  private readonly consumedTokens: number;

  private constructor(total: number, consumed: number) {
    if (total < 0 || consumed < 0 || consumed > total) {
      throw new Error('Invalid budget: consumed cannot exceed total');
    }
    this.totalTokens = total;
    this.consumedTokens = consumed;
  }

  static create(totalTokens: number): ContextBudget {
    return new ContextBudget(totalTokens, 0);
  }

  consume(tokens: number): ContextBudget {
    const newConsumed = this.consumedTokens + tokens;
    if (newConsumed > this.totalTokens) {
      throw new BudgetExceededError(this.totalTokens, newConsumed);
    }
    return new ContextBudget(this.totalTokens, newConsumed);
  }

  getRemaining(): number {
    return this.totalTokens - this.consumedTokens;
  }

  getUtilization(): number {
    if (this.totalTokens === 0) return 0;
    return this.consumedTokens / this.totalTokens;
  }

  getThrottleLevel(): ThrottleLevel {
    const utilization = this.getUtilization();
    if (utilization < 0.5) return ThrottleLevel.NORMAL;
    if (utilization < 0.75) return ThrottleLevel.REDUCED;
    if (utilization < 0.90) return ThrottleLevel.MINIMAL;
    return ThrottleLevel.BLOCKED;
  }

  canConsume(tokens: number): boolean {
    return this.consumedTokens + tokens <= this.totalTokens;
  }

  equals(other: ContextBudget): boolean {
    return this.totalTokens === other.totalTokens
        && this.consumedTokens === other.consumedTokens;
  }
}
```

#### SearchQuery

Represents a validated search query with match layer tracking.

```typescript
/**
 * Search Query Value Object
 * Encapsulates query text with normalization
 */
class SearchQuery {
  private readonly raw: string;
  private readonly normalized: string;
  private readonly tokens: string[];

  private constructor(raw: string) {
    if (!raw || raw.trim().length === 0) {
      throw new Error('Search query cannot be empty');
    }
    this.raw = raw;
    this.normalized = raw.trim().toLowerCase();
    this.tokens = this.normalized.split(/\s+/);
  }

  static create(query: string): SearchQuery {
    return new SearchQuery(query);
  }

  getRaw(): string { return this.raw; }
  getNormalized(): string { return this.normalized; }
  getTokens(): string[] { return [...this.tokens]; }
  getTokenCount(): number { return this.tokens.length; }

  toFTS5Match(): string {
    return this.tokens.map(t => `"${t}"`).join(' AND ');
  }

  toTrigramPattern(): string {
    return this.normalized;
  }
}
```

#### SnippetWindow

Represents an extracted contextual window around matched content.

```typescript
/**
 * Snippet Window Value Object
 * A contextual extract from larger content
 */
class SnippetWindow {
  readonly text: string;
  readonly heading: string;
  readonly matchLayer: MatchLayer;
  readonly relevanceScore: number;
  readonly highlightRanges: readonly Range[];

  private constructor(props: SnippetWindowProps) {
    this.text = props.text;
    this.heading = props.heading;
    this.matchLayer = props.matchLayer;
    this.relevanceScore = props.relevanceScore;
    this.highlightRanges = Object.freeze([...props.highlightRanges]);
  }

  static create(props: SnippetWindowProps): SnippetWindow {
    return new SnippetWindow(props);
  }

  getTokenEstimate(): number {
    return Math.ceil(this.text.length / 4); // rough token estimate
  }
}

type MatchLayer = 'stemming' | 'trigram' | 'fuzzy';
```

### Entities

#### KnowledgeChunk

A heading-bounded segment of indexed content.

```typescript
/**
 * Knowledge Chunk Entity
 * Identity: chunkId
 * A searchable segment of tool output stored in the knowledge base
 */
class KnowledgeChunk {
  readonly chunkId: string;
  readonly content: string;
  readonly heading: string;
  readonly source: ChunkSource;
  readonly sessionId: string;
  readonly createdAt: Date;
  readonly contentHash: string;
  readonly tokenCount: number;

  constructor(props: KnowledgeChunkProps) {
    this.chunkId = props.chunkId || generateId();
    this.content = props.content;
    this.heading = props.heading;
    this.source = props.source;
    this.sessionId = props.sessionId;
    this.createdAt = props.createdAt || new Date();
    this.contentHash = computeHash(props.content);
    this.tokenCount = estimateTokens(props.content);
  }

  isExpired(ttlMs: number): boolean {
    return Date.now() - this.createdAt.getTime() > ttlMs;
  }

  isDuplicateOf(other: KnowledgeChunk): boolean {
    return this.contentHash === other.contentHash;
  }
}

interface ChunkSource {
  toolName: string;
  agentId?: string;
  url?: string;
  filePath?: string;
}
```

#### SandboxInstance

A process-isolated execution environment.

```typescript
/**
 * Sandbox Instance Entity
 * Identity: sandboxId
 * Lifecycle: acquired → executing → released
 */
class SandboxInstance {
  readonly sandboxId: string;
  readonly runtime: RuntimeType;
  readonly pid: number;
  private state: SandboxState;
  private readonly createdAt: Date;
  private lastUsedAt: Date;

  constructor(props: SandboxProps) {
    this.sandboxId = props.sandboxId || generateId();
    this.runtime = props.runtime;
    this.pid = props.pid;
    this.state = SandboxState.IDLE;
    this.createdAt = new Date();
    this.lastUsedAt = new Date();
  }

  acquire(): void {
    if (this.state !== SandboxState.IDLE) {
      throw new Error(`Cannot acquire sandbox in state: ${this.state}`);
    }
    this.state = SandboxState.ACQUIRED;
    this.lastUsedAt = new Date();
  }

  markExecuting(): void {
    if (this.state !== SandboxState.ACQUIRED) {
      throw new Error(`Cannot execute sandbox in state: ${this.state}`);
    }
    this.state = SandboxState.EXECUTING;
  }

  release(): void {
    this.state = SandboxState.IDLE;
    this.lastUsedAt = new Date();
  }

  isStale(idleTimeoutMs: number): boolean {
    return this.state === SandboxState.IDLE
        && Date.now() - this.lastUsedAt.getTime() > idleTimeoutMs;
  }
}

enum SandboxState {
  IDLE = 'idle',
  ACQUIRED = 'acquired',
  EXECUTING = 'executing',
  TERMINATED = 'terminated',
}
```

### Aggregates

#### CompressionSession (Aggregate Root)

```typescript
/**
 * Compression Session Aggregate Root
 * Manages all context optimization for a single session
 */
class CompressionSession {
  readonly sessionId: string;
  private readonly startedAt: Date;
  private totalRawBytes: number = 0;
  private totalCompressedBytes: number = 0;
  private readonly toolStats: Map<string, ToolCompressionStats> = new Map();
  private readonly pendingEvents: DomainEvent[] = [];

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.startedAt = new Date();
  }

  recordCompression(toolName: string, rawSize: number, compressedSize: number): void {
    this.totalRawBytes += rawSize;
    this.totalCompressedBytes += compressedSize;

    const existing = this.toolStats.get(toolName) || ToolCompressionStats.empty(toolName);
    this.toolStats.set(toolName, existing.addSample(rawSize, compressedSize));

    this.pendingEvents.push(new OutputCompressedEvent({
      sessionId: this.sessionId,
      toolName,
      rawSize,
      compressedSize,
      ratio: CompressionRatio.create(rawSize, compressedSize),
    }));
  }

  getOverallRatio(): CompressionRatio {
    return CompressionRatio.create(this.totalRawBytes, this.totalCompressedBytes);
  }

  getStats(): SessionCompressionStats {
    return {
      sessionId: this.sessionId,
      duration: Date.now() - this.startedAt.getTime(),
      totalRawBytes: this.totalRawBytes,
      totalCompressedBytes: this.totalCompressedBytes,
      overallRatio: this.getOverallRatio(),
      perTool: Object.fromEntries(this.toolStats),
    };
  }

  pullEvents(): DomainEvent[] {
    const events = [...this.pendingEvents];
    this.pendingEvents.length = 0;
    return events;
  }
}
```

#### KnowledgeBase (Aggregate Root)

```typescript
/**
 * Knowledge Base Aggregate Root
 * Manages the dual-index searchable store
 */
class KnowledgeBase {
  readonly sessionId: string;
  private readonly chunks: Map<string, KnowledgeChunk> = new Map();
  private readonly contentHashes: Set<string> = new Set();
  private readonly evictionTTL: number;
  private readonly pendingEvents: DomainEvent[] = [];

  constructor(sessionId: string, evictionTTL: number = 4 * 60 * 60 * 1000) {
    this.sessionId = sessionId;
    this.evictionTTL = evictionTTL;
  }

  addChunk(chunk: KnowledgeChunk): boolean {
    // Deduplication check
    if (this.contentHashes.has(chunk.contentHash)) {
      return false; // Already indexed
    }

    this.chunks.set(chunk.chunkId, chunk);
    this.contentHashes.add(chunk.contentHash);

    this.pendingEvents.push(new ContentIndexedEvent({
      sessionId: this.sessionId,
      chunkId: chunk.chunkId,
      source: chunk.source,
      tokenCount: chunk.tokenCount,
    }));

    return true;
  }

  evictExpired(): number {
    let evicted = 0;
    for (const [id, chunk] of this.chunks) {
      if (chunk.isExpired(this.evictionTTL)) {
        this.chunks.delete(id);
        this.contentHashes.delete(chunk.contentHash);
        evicted++;
      }
    }
    return evicted;
  }

  hasContent(hash: string): boolean {
    return this.contentHashes.has(hash);
  }

  getChunkCount(): number {
    return this.chunks.size;
  }

  pullEvents(): DomainEvent[] {
    const events = [...this.pendingEvents];
    this.pendingEvents.length = 0;
    return events;
  }
}
```

### Domain Services

#### CompressionPipelineService

Orchestrates the multi-stage compression pipeline.

```typescript
/**
 * Compression Pipeline Domain Service
 * Coordinates sandbox execution, intent filtering, and snippet extraction
 */
class CompressionPipelineService {
  constructor(
    private readonly sandboxPool: ISandboxPool,
    private readonly snippetExtractor: ISnippetExtractor,
    private readonly knowledgeBase: KnowledgeBase,
    private readonly session: CompressionSession,
  ) {}

  async compress(output: RawToolOutput, options: CompressionOptions): Promise<CompressedOutput> {
    // Bypass for small outputs
    if (output.sizeBytes < options.bypassThreshold) {
      return CompressedOutput.passthrough(output);
    }

    // Stage 1: Sandbox execution
    const sandboxResult = await this.sandboxPool.execute(
      output.content, detectRuntime(output), { timeout: options.timeout }
    );

    // Stage 2: Intent-driven filtering
    let filtered = sandboxResult.stdout;
    if (options.intent && filtered.length > options.intentThreshold) {
      const indexed = await this.knowledgeBase.indexTransient(filtered);
      const relevant = await indexed.search(options.intent);
      filtered = relevant.map(r => r.text).join('\n');
    }

    // Stage 3: Smart snippet extraction
    const snippet = this.snippetExtractor.extract(filtered, {
      maxTokens: options.maxTokens,
      preserveStructure: true,
    });

    // Record metrics
    this.session.recordCompression(output.toolName, output.sizeBytes, snippet.sizeBytes);

    return CompressedOutput.create(snippet, output.toolName);
  }
}
```

#### FuzzySearchService

Implements the three-layer search fallback.

```typescript
/**
 * Fuzzy Search Domain Service
 * Three-layer search: stemming → trigram → Levenshtein
 */
class FuzzySearchService {
  constructor(
    private readonly fts5Store: IFTS5Store,
    private readonly levenshtein: ILevenshteinCorrector,
  ) {}

  async search(query: SearchQuery, options: SearchOptions): Promise<SearchResult[]> {
    // Layer 1: Porter stemming
    const stemmingResults = await this.fts5Store.match(query.toFTS5Match());
    if (stemmingResults.length > 0) {
      return this.annotateResults(stemmingResults, 'stemming');
    }

    // Layer 2: Trigram substring
    const trigramResults = await this.fts5Store.trigramSearch(query.toTrigramPattern());
    if (trigramResults.length > 0) {
      return this.annotateResults(trigramResults, 'trigram');
    }

    // Layer 3: Levenshtein fuzzy correction
    const corrected = this.levenshtein.correct(query.getNormalized());
    if (corrected) {
      const fuzzyResults = await this.fts5Store.match(
        SearchQuery.create(corrected).toFTS5Match()
      );
      return this.annotateResults(fuzzyResults, 'fuzzy', corrected);
    }

    return [];
  }

  private annotateResults(
    results: RawSearchResult[],
    layer: MatchLayer,
    correctedQuery?: string,
  ): SearchResult[] {
    return results.map(r => ({
      ...r,
      matchLayer: layer,
      correctedQuery,
    }));
  }
}
```

### Domain Events

```typescript
/** Emitted when a tool output is compressed */
class OutputCompressedEvent implements DomainEvent {
  readonly type = 'context.output_compressed';
  readonly occurredAt = new Date();
  constructor(readonly payload: {
    sessionId: string;
    toolName: string;
    rawSize: number;
    compressedSize: number;
    ratio: CompressionRatio;
  }) {}
}

/** Emitted when content is indexed into the knowledge base */
class ContentIndexedEvent implements DomainEvent {
  readonly type = 'context.content_indexed';
  readonly occurredAt = new Date();
  constructor(readonly payload: {
    sessionId: string;
    chunkId: string;
    source: ChunkSource;
    tokenCount: number;
  }) {}
}

/** Emitted when an agent exceeds its context budget */
class BudgetExceededEvent implements DomainEvent {
  readonly type = 'context.budget_exceeded';
  readonly occurredAt = new Date();
  constructor(readonly payload: {
    sessionId: string;
    agentId: string;
    budgetTotal: number;
    attempted: number;
    throttleLevel: ThrottleLevel;
  }) {}
}

/** Emitted when knowledge base entries are evicted */
class ChunksEvictedEvent implements DomainEvent {
  readonly type = 'context.chunks_evicted';
  readonly occurredAt = new Date();
  constructor(readonly payload: {
    sessionId: string;
    evictedCount: number;
    remainingCount: number;
  }) {}
}
```

### Repository Interfaces

```typescript
/** Persistence contract for FTS5 knowledge store */
interface IFTS5Repository {
  insert(chunk: KnowledgeChunk): Promise<void>;
  match(query: string): Promise<RawSearchResult[]>;
  trigramSearch(pattern: string): Promise<RawSearchResult[]>;
  getVocabulary(): Promise<string[]>;
  evict(predicate: (chunk: KnowledgeChunk) => boolean): Promise<number>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

/** Persistence contract for compression session state */
interface ICompressionSessionRepository {
  save(session: CompressionSession): Promise<void>;
  load(sessionId: string): Promise<CompressionSession | null>;
  getActiveSession(): Promise<CompressionSession | null>;
}

/** Persistence contract for context budgets */
interface IContextBudgetRepository {
  save(agentId: string, budget: ContextBudget): Promise<void>;
  load(agentId: string): Promise<ContextBudget | null>;
  loadAll(): Promise<Map<string, ContextBudget>>;
  delete(agentId: string): Promise<void>;
}
```
