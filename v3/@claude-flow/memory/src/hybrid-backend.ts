/**
 * HybridBackend - Combines SQLite (structured queries) + AgentDB (vector search)
 *
 * Per ADR-009: "HybridBackend (SQLite + AgentDB) as default"
 * - SQLite for: Structured queries, ACID transactions, exact matches
 * - AgentDB for: Semantic search, vector similarity, RAG
 *
 * Includes a TwoPhaseCommitCoordinator that ensures both backends stay in sync:
 * - Phase 1 PREPARE: acquire version tokens for both backends
 * - Phase 2 COMMIT:  write to both; on any error ROLLBACK by deleting/restoring
 * - WAL journal: append to `.claude/data/wal.jsonl` before writes, mark committed after
 *
 * @module v3/memory/hybrid-backend
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  IMemoryBackend,
  MemoryEntry,
  MemoryEntryInput,
  MemoryEntryUpdate,
  MemoryQuery,
  SearchOptions,
  SearchResult,
  BackendStats,
  HealthCheckResult,
  ComponentHealth,
  EmbeddingGenerator,
  createDefaultEntry,
  QueryType,
} from './types.js';
import { SQLiteBackend, SQLiteBackendConfig } from './sqlite-backend.js';
import { AgentDBBackend, AgentDBBackendConfig } from './agentdb-backend.js';

/**
 * Configuration for HybridBackend
 */
export interface HybridBackendConfig {
  /** SQLite configuration */
  sqlite?: Partial<SQLiteBackendConfig>;

  /** AgentDB configuration */
  agentdb?: Partial<AgentDBBackendConfig>;

  /** Default namespace */
  defaultNamespace?: string;

  /** Embedding generator function */
  embeddingGenerator?: EmbeddingGenerator;

  /** Query routing strategy */
  routingStrategy?: 'auto' | 'sqlite-first' | 'agentdb-first';

  /** Enable dual-write (write to both backends) */
  dualWrite?: boolean;

  /** Semantic search threshold for hybrid queries */
  semanticThreshold?: number;

  /** Maximum results to fetch from each backend in hybrid queries */
  hybridMaxResults?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<HybridBackendConfig> = {
  sqlite: {},
  agentdb: {},
  defaultNamespace: 'default',
  embeddingGenerator: undefined as any,
  routingStrategy: 'auto',
  dualWrite: true,
  semanticThreshold: 0.7,
  hybridMaxResults: 100,
};

/**
 * Structured Query Interface
 * Optimized for SQLite's strengths
 */
export interface StructuredQuery {
  /** Exact key match */
  key?: string;

  /** Key prefix match */
  keyPrefix?: string;

  /** Namespace filter */
  namespace?: string;

  /** Owner filter */
  ownerId?: string;

  /** Type filter */
  type?: string;

  /** Time range filters */
  createdAfter?: number;
  createdBefore?: number;
  updatedAfter?: number;
  updatedBefore?: number;

  /** Pagination */
  limit?: number;
  offset?: number;
}

/**
 * Semantic Query Interface
 * Optimized for AgentDB's vector search
 */
export interface SemanticQuery {
  /** Content to search for (will be embedded) */
  content?: string;

  /** Pre-computed embedding */
  embedding?: Float32Array;

  /** Number of results */
  k?: number;

  /** Similarity threshold (0-1) */
  threshold?: number;

  /** Additional filters */
  filters?: Partial<MemoryQuery>;
}

/**
 * Hybrid Query Interface
 * Combines structured + semantic search
 */
export interface HybridQuery {
  /** Semantic component */
  semantic: SemanticQuery;

  /** Structured component */
  structured?: StructuredQuery;

  /** How to combine results */
  combineStrategy?: 'union' | 'intersection' | 'semantic-first' | 'structured-first';

  /** Weights for score combination */
  weights?: {
    semantic: number;
    structured: number;
  };
}

// ===== WAL Journal Types =====

type WalOperation = 'set' | 'delete';
type WalStatus = 'prepared' | 'committed' | 'rolled-back';

interface WalRecord {
  id: string;
  operation: WalOperation;
  /** ISO timestamp of the prepare phase */
  preparedAt: string;
  /** Version tokens at prepare time */
  sqliteVersion: number;
  agentdbVersion: number;
  status: WalStatus;
  committedAt?: string;
}

// ===== Two-Phase Commit Coordinator =====

/**
 * Coordinates writes across SQLite and AgentDB using a simple 2-phase commit
 * protocol backed by a WAL (write-ahead log) on disk.
 *
 * Protocol:
 *   PREPARE  — record intent in WAL with current version tokens
 *   COMMIT   — write to both backends; mark WAL record committed
 *   ROLLBACK — on error, undo partial writes; mark WAL record rolled-back
 *
 * The WAL file lives at `.claude/data/wal.jsonl` (one JSON record per line).
 * On startup, any `prepared` (uncommitted) WAL records signal a crash during a
 * prior commit; callers can inspect `getPendingRecovery()` and replay or skip.
 */
export class TwoPhaseCommitCoordinator {
  private walPath: string;
  /** Monotonic SQLite version counter for this process. */
  private sqliteSeq: number = 0;
  /** Monotonic AgentDB version counter for this process. */
  private agentdbSeq: number = 0;

  constructor(walDir?: string) {
    const dir = walDir ?? path.join(os.homedir(), '.claude', 'data');
    this.walPath = path.join(dir, 'wal.jsonl');
    this.ensureWalDir(dir);
  }

  /**
   * Execute a write through the 2-phase commit protocol.
   *
   * @param id          - Logical identifier for the entry being written.
   * @param operation   - 'set' or 'delete'.
   * @param commit      - Async function that performs the actual dual-write.
   *   It receives `(sqliteVersion, agentdbVersion)` so it can tag writes.
   * @param rollback    - Async function to undo partial work on failure.
   */
  async execute(
    id: string,
    operation: WalOperation,
    commit: (sqliteVersion: number, agentdbVersion: number) => Promise<void>,
    rollback: () => Promise<void>
  ): Promise<void> {
    // PHASE 1: PREPARE
    const sqliteVersion = ++this.sqliteSeq;
    const agentdbVersion = ++this.agentdbSeq;

    const record: WalRecord = {
      id,
      operation,
      preparedAt: new Date().toISOString(),
      sqliteVersion,
      agentdbVersion,
      status: 'prepared',
    };
    this.appendWal(record);

    // PHASE 2: COMMIT
    try {
      await commit(sqliteVersion, agentdbVersion);
      record.status = 'committed';
      record.committedAt = new Date().toISOString();
      this.appendWal(record);
    } catch (err) {
      // ROLLBACK
      try {
        await rollback();
      } catch {
        // Rollback errors are swallowed — the WAL record marks the failure
      }
      record.status = 'rolled-back';
      this.appendWal(record);
      throw err;
    }
  }

  /**
   * Returns WAL records in `prepared` state (i.e. not yet committed or
   * rolled back) — these indicate writes that may be incomplete after a crash.
   * The WAL file is read fresh each call so the result is always current.
   */
  getPendingRecovery(): WalRecord[] {
    const lines = this.readWalLines();
    // Build a map: id -> latest record, then filter by status
    const latest = new Map<string, WalRecord>();
    for (const line of lines) {
      try {
        const rec: WalRecord = JSON.parse(line);
        // Later entries for the same id+version supersede earlier ones
        const key = `${rec.id}:${rec.sqliteVersion}`;
        latest.set(key, rec);
      } catch {
        // Malformed line — skip
      }
    }
    return [...latest.values()].filter((r) => r.status === 'prepared');
  }

  // ===== Private WAL Helpers =====

  private appendWal(record: WalRecord): void {
    try {
      fs.appendFileSync(this.walPath, JSON.stringify(record) + '\n', 'utf8');
    } catch {
      // WAL write failure is non-fatal for the commit itself —
      // durability is best-effort in this lightweight implementation.
    }
  }

  private readWalLines(): string[] {
    try {
      const content = fs.readFileSync(this.walPath, 'utf8');
      return content.split('\n').filter((l) => l.trim().length > 0);
    } catch {
      return [];
    }
  }

  private ensureWalDir(dir: string): void {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // Directory creation failure is non-fatal
    }
  }
}

// ===== HybridBackend =====

/**
 * HybridBackend Implementation
 *
 * Intelligently routes queries between SQLite and AgentDB:
 * - Exact matches, prefix queries → SQLite
 * - Semantic search, similarity → AgentDB
 * - Complex hybrid queries → Both backends with intelligent merging
 */
export class HybridBackend extends EventEmitter implements IMemoryBackend {
  private sqlite: SQLiteBackend;
  private agentdb: AgentDBBackend;
  private config: Required<HybridBackendConfig>;
  private initialized: boolean = false;
  private twoPC: TwoPhaseCommitCoordinator;

  // Performance tracking
  private stats = {
    sqliteQueries: 0,
    agentdbQueries: 0,
    hybridQueries: 0,
    totalQueryTime: 0,
  };

  constructor(config: HybridBackendConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize 2-phase commit coordinator (WAL in .claude/data/)
    this.twoPC = new TwoPhaseCommitCoordinator();

    // Initialize SQLite backend
    this.sqlite = new SQLiteBackend({
      ...this.config.sqlite,
      defaultNamespace: this.config.defaultNamespace,
      embeddingGenerator: this.config.embeddingGenerator,
    });

    // Initialize AgentDB backend
    this.agentdb = new AgentDBBackend({
      ...this.config.agentdb,
      namespace: this.config.defaultNamespace,
      embeddingGenerator: this.config.embeddingGenerator,
    });

    // Forward events from both backends
    this.sqlite.on('entry:stored', (data) => this.emit('sqlite:stored', data));
    this.sqlite.on('entry:updated', (data) => this.emit('sqlite:updated', data));
    this.sqlite.on('entry:deleted', (data) => this.emit('sqlite:deleted', data));

    this.agentdb.on('entry:stored', (data) => this.emit('agentdb:stored', data));
    this.agentdb.on('entry:updated', (data) => this.emit('agentdb:updated', data));
    this.agentdb.on('entry:deleted', (data) => this.emit('agentdb:deleted', data));
    this.agentdb.on('cache:hit', (data) => this.emit('cache:hit', data));
    this.agentdb.on('cache:miss', (data) => this.emit('cache:miss', data));
  }

  /**
   * Initialize both backends
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await Promise.all([this.sqlite.initialize(), this.agentdb.initialize()]);

    this.initialized = true;
    this.emit('initialized');
  }

  /**
   * Shutdown both backends
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    await Promise.all([this.sqlite.shutdown(), this.agentdb.shutdown()]);

    this.initialized = false;
    this.emit('shutdown');
  }

  /**
   * Store in both backends using 2-phase commit (dual-write mode)
   * or directly into AgentDB (single-write mode).
   */
  async store(entry: MemoryEntry): Promise<void> {
    if (this.config.dualWrite) {
      await this.twoPC.execute(
        entry.id,
        'set',
        async (_sqliteVer, _agentdbVer) => {
          await Promise.all([
            this.sqlite.store(entry),
            this.agentdb.store(entry),
          ]);
        },
        async () => {
          // Best-effort rollback: attempt to remove the partial write
          try { await this.sqlite.delete(entry.id); } catch { /* no-op */ }
          try { await this.agentdb.delete(entry.id); } catch { /* no-op */ }
        }
      );
    } else {
      await this.agentdb.store(entry);
    }

    this.emit('entry:stored', { id: entry.id });
  }

  /**
   * Get from AgentDB (has caching enabled)
   */
  async get(id: string): Promise<MemoryEntry | null> {
    return this.agentdb.get(id);
  }

  /**
   * Get by key (SQLite optimized for exact matches)
   */
  async getByKey(namespace: string, key: string): Promise<MemoryEntry | null> {
    return this.sqlite.getByKey(namespace, key);
  }

  /**
   * Update in both backends
   */
  async update(id: string, update: MemoryEntryUpdate): Promise<MemoryEntry | null> {
    if (this.config.dualWrite) {
      // Update both backends
      const [sqliteResult, agentdbResult] = await Promise.all([
        this.sqlite.update(id, update),
        this.agentdb.update(id, update),
      ]);
      return agentdbResult || sqliteResult;
    } else {
      return this.agentdb.update(id, update);
    }
  }

  /**
   * Delete from both backends using 2-phase commit (dual-write mode).
   */
  async delete(id: string): Promise<boolean> {
    if (this.config.dualWrite) {
      // Snapshot the entry before deletion so we can restore on rollback
      const snapshot = await this.agentdb.get(id);
      let deleted = false;

      await this.twoPC.execute(
        id,
        'delete',
        async (_sqliteVer, _agentdbVer) => {
          const [sqliteResult, agentdbResult] = await Promise.all([
            this.sqlite.delete(id),
            this.agentdb.delete(id),
          ]);
          deleted = sqliteResult || agentdbResult;
        },
        async () => {
          // Restore the snapshot to both backends on rollback
          if (snapshot) {
            try { await this.sqlite.store(snapshot); } catch { /* no-op */ }
            try { await this.agentdb.store(snapshot); } catch { /* no-op */ }
          }
        }
      );

      return deleted;
    } else {
      return this.agentdb.delete(id);
    }
  }

  /**
   * Query routing - semantic goes to AgentDB, structured to SQLite
   */
  async query(query: MemoryQuery): Promise<MemoryEntry[]> {
    const startTime = performance.now();

    let results: MemoryEntry[];

    // Route based on query type
    switch (query.type) {
      case 'exact':
        // SQLite optimized for exact matches
        this.stats.sqliteQueries++;
        results = await this.sqlite.query(query);
        break;

      case 'prefix':
        // SQLite optimized for prefix queries
        this.stats.sqliteQueries++;
        results = await this.sqlite.query(query);
        break;

      case 'tag':
        // Both can handle tags, use SQLite for structured filtering
        this.stats.sqliteQueries++;
        results = await this.sqlite.query(query);
        break;

      case 'semantic':
        // AgentDB optimized for semantic search
        this.stats.agentdbQueries++;
        results = await this.agentdb.query(query);
        break;

      case 'hybrid':
        // Use hybrid query combining both backends
        this.stats.hybridQueries++;
        results = await this.queryHybridInternal(query);
        break;

      default:
        // Auto-routing based on query properties
        results = await this.autoRoute(query);
    }

    const duration = performance.now() - startTime;
    this.stats.totalQueryTime += duration;

    this.emit('query:completed', { type: query.type, duration, count: results.length });
    return results;
  }

  /**
   * Structured queries (SQL)
   * Routes to SQLite for optimal performance
   */
  async queryStructured(query: StructuredQuery): Promise<MemoryEntry[]> {
    this.stats.sqliteQueries++;

    const memoryQuery: MemoryQuery = {
      type: query.key ? 'exact' : query.keyPrefix ? 'prefix' : 'hybrid',
      key: query.key,
      keyPrefix: query.keyPrefix,
      namespace: query.namespace,
      ownerId: query.ownerId,
      memoryType: query.type as any,
      createdAfter: query.createdAfter,
      createdBefore: query.createdBefore,
      updatedAfter: query.updatedAfter,
      updatedBefore: query.updatedBefore,
      limit: query.limit || 100,
      offset: query.offset || 0,
    };

    return this.sqlite.query(memoryQuery);
  }

  /**
   * Semantic queries (vector)
   * Routes to AgentDB for HNSW-based vector search
   */
  async querySemantic(query: SemanticQuery): Promise<MemoryEntry[]> {
    this.stats.agentdbQueries++;

    let embedding = query.embedding;

    // Generate embedding if content provided
    if (!embedding && query.content && this.config.embeddingGenerator) {
      embedding = await this.config.embeddingGenerator(query.content);
    }

    if (!embedding) {
      throw new Error('SemanticQuery requires either content or embedding');
    }

    const searchResults = await this.agentdb.search(embedding, {
      k: (query.k || 10) * 2, // Over-fetch to account for post-filtering
      threshold: query.threshold || this.config.semanticThreshold,
      filters: query.filters as MemoryQuery | undefined,
    });

    let entries = searchResults.map((r) => r.entry);

    // Apply tag/namespace/type filters that AgentDB may not enforce
    if (query.filters) {
      const f = query.filters as Record<string, unknown>;
      if (f.tags && Array.isArray(f.tags)) {
        const requiredTags = f.tags as string[];
        entries = entries.filter((e) =>
          requiredTags.every((t) => e.tags.includes(t))
        );
      }
      if (f.namespace && typeof f.namespace === 'string') {
        entries = entries.filter((e) => e.namespace === f.namespace);
      }
      if (f.type && typeof f.type === 'string' && f.type !== 'semantic') {
        entries = entries.filter((e) => e.type === f.type);
      }
    }

    return entries.slice(0, query.k || 10);
  }

  /**
   * Hybrid queries (combine both)
   * Intelligently merges results from both backends
   */
  async queryHybrid(query: HybridQuery): Promise<MemoryEntry[]> {
    this.stats.hybridQueries++;

    const strategy = query.combineStrategy || 'semantic-first';
    const weights = query.weights || { semantic: 0.7, structured: 0.3 };

    // Execute both queries in parallel
    const [semanticResults, structuredResults] = await Promise.all([
      this.querySemantic(query.semantic),
      query.structured ? this.queryStructured(query.structured) : Promise.resolve([]),
    ]);

    // Combine results based on strategy
    switch (strategy) {
      case 'union':
        return this.combineUnion(semanticResults, structuredResults);

      case 'intersection':
        return this.combineIntersection(semanticResults, structuredResults);

      case 'semantic-first':
        return this.combineSemanticFirst(semanticResults, structuredResults);

      case 'structured-first':
        return this.combineStructuredFirst(semanticResults, structuredResults);

      default:
        return this.combineUnion(semanticResults, structuredResults);
    }
  }

  /**
   * Semantic vector search (routes to AgentDB)
   */
  async search(embedding: Float32Array, options: SearchOptions): Promise<SearchResult[]> {
    this.stats.agentdbQueries++;
    return this.agentdb.search(embedding, options);
  }

  /**
   * Bulk insert to both backends
   */
  async bulkInsert(entries: MemoryEntry[]): Promise<void> {
    if (this.config.dualWrite) {
      await Promise.all([this.sqlite.bulkInsert(entries), this.agentdb.bulkInsert(entries)]);
    } else {
      await this.agentdb.bulkInsert(entries);
    }
  }

  /**
   * Bulk delete from both backends
   */
  async bulkDelete(ids: string[]): Promise<number> {
    if (this.config.dualWrite) {
      const [sqliteCount, agentdbCount] = await Promise.all([
        this.sqlite.bulkDelete(ids),
        this.agentdb.bulkDelete(ids),
      ]);
      return Math.max(sqliteCount, agentdbCount);
    } else {
      return this.agentdb.bulkDelete(ids);
    }
  }

  /**
   * Count entries (use SQLite for efficiency)
   */
  async count(namespace?: string): Promise<number> {
    return this.sqlite.count(namespace);
  }

  /**
   * List namespaces (use SQLite)
   */
  async listNamespaces(): Promise<string[]> {
    return this.sqlite.listNamespaces();
  }

  /**
   * Clear namespace in both backends
   */
  async clearNamespace(namespace: string): Promise<number> {
    if (this.config.dualWrite) {
      const [sqliteCount, agentdbCount] = await Promise.all([
        this.sqlite.clearNamespace(namespace),
        this.agentdb.clearNamespace(namespace),
      ]);
      return Math.max(sqliteCount, agentdbCount);
    } else {
      return this.agentdb.clearNamespace(namespace);
    }
  }

  /**
   * Get combined statistics from both backends
   */
  async getStats(): Promise<BackendStats> {
    const [sqliteStats, agentdbStats] = await Promise.all([
      this.sqlite.getStats(),
      this.agentdb.getStats(),
    ]);

    return {
      totalEntries: Math.max(sqliteStats.totalEntries, agentdbStats.totalEntries),
      entriesByNamespace: agentdbStats.entriesByNamespace,
      entriesByType: agentdbStats.entriesByType,
      memoryUsage: sqliteStats.memoryUsage + agentdbStats.memoryUsage,
      hnswStats: agentdbStats.hnswStats ?? {
        vectorCount: agentdbStats.totalEntries,
        memoryUsage: 0,
        avgSearchTime: agentdbStats.avgSearchTime,
        buildTime: 0,
        compressionRatio: 1.0,
      },
      cacheStats: (agentdbStats as any).cacheStats ?? {
        hitRate: 0,
        size: 0,
        maxSize: 1000,
      },
      avgQueryTime:
        this.stats.hybridQueries + this.stats.sqliteQueries + this.stats.agentdbQueries > 0
          ? this.stats.totalQueryTime /
            (this.stats.hybridQueries + this.stats.sqliteQueries + this.stats.agentdbQueries)
          : 0,
      avgSearchTime: agentdbStats.avgSearchTime,
    };
  }

  /**
   * Health check for both backends
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const [sqliteHealth, agentdbHealth] = await Promise.all([
      this.sqlite.healthCheck(),
      this.agentdb.healthCheck(),
    ]);

    const allIssues = [...sqliteHealth.issues, ...agentdbHealth.issues];
    const allRecommendations = [
      ...sqliteHealth.recommendations,
      ...agentdbHealth.recommendations,
    ];

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (
      sqliteHealth.status === 'unhealthy' ||
      agentdbHealth.status === 'unhealthy'
    ) {
      status = 'unhealthy';
    } else if (
      sqliteHealth.status === 'degraded' ||
      agentdbHealth.status === 'degraded'
    ) {
      status = 'degraded';
    }

    return {
      status,
      components: {
        storage: sqliteHealth.components.storage,
        index: agentdbHealth.components.index,
        cache: agentdbHealth.components.cache,
      },
      timestamp: Date.now(),
      issues: allIssues,
      recommendations: allRecommendations,
    };
  }

  // ===== Private Methods =====

  /**
   * Auto-route queries based on properties
   */
  private async autoRoute(query: MemoryQuery): Promise<MemoryEntry[]> {
    // If has embedding or content, use semantic search (AgentDB)
    const hasEmbeddingGenerator = typeof this.config.embeddingGenerator === 'function';
    if (query.embedding || (query.content && hasEmbeddingGenerator)) {
      this.stats.agentdbQueries++;
      return this.agentdb.query(query);
    }

    // If has exact key or prefix, use structured search (SQLite)
    if (query.key || query.keyPrefix) {
      this.stats.sqliteQueries++;
      return this.sqlite.query(query);
    }

    // For other filters, use routing strategy
    switch (this.config.routingStrategy) {
      case 'sqlite-first':
        this.stats.sqliteQueries++;
        return this.sqlite.query(query);

      case 'agentdb-first':
        this.stats.agentdbQueries++;
        return this.agentdb.query(query);

      case 'auto':
      default:
        // Default to AgentDB (has caching)
        this.stats.agentdbQueries++;
        return this.agentdb.query(query);
    }
  }

  /**
   * Internal hybrid query implementation
   */
  private async queryHybridInternal(query: MemoryQuery): Promise<MemoryEntry[]> {
    // If semantic component exists, use hybrid
    if (query.embedding || query.content) {
      const semanticQuery: SemanticQuery = {
        content: query.content,
        embedding: query.embedding,
        k: query.limit || 10,
        threshold: query.threshold,
        filters: query,
      };

      const structuredQuery: StructuredQuery = {
        namespace: query.namespace,
        key: query.key,
        keyPrefix: query.keyPrefix,
        ownerId: query.ownerId,
        type: query.memoryType,
        createdAfter: query.createdAfter,
        createdBefore: query.createdBefore,
        updatedAfter: query.updatedAfter,
        updatedBefore: query.updatedBefore,
        limit: query.limit,
        offset: query.offset,
      };

      return this.queryHybrid({
        semantic: semanticQuery,
        structured: structuredQuery,
        combineStrategy: 'semantic-first',
      });
    }

    // Otherwise, route to structured
    return this.autoRoute(query);
  }

  /**
   * Combine results using union (all unique results)
   */
  private combineUnion(
    semanticResults: MemoryEntry[],
    structuredResults: MemoryEntry[]
  ): MemoryEntry[] {
    const seen = new Set<string>();
    const combined: MemoryEntry[] = [];

    for (const entry of [...semanticResults, ...structuredResults]) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        combined.push(entry);
      }
    }

    return combined;
  }

  /**
   * Combine results using intersection (only common results)
   */
  private combineIntersection(
    semanticResults: MemoryEntry[],
    structuredResults: MemoryEntry[]
  ): MemoryEntry[] {
    const semanticIds = new Set(semanticResults.map((e) => e.id));
    return structuredResults.filter((e) => semanticIds.has(e.id));
  }

  /**
   * Semantic-first: Prefer semantic results, add structured if not present
   */
  private combineSemanticFirst(
    semanticResults: MemoryEntry[],
    structuredResults: MemoryEntry[]
  ): MemoryEntry[] {
    const semanticIds = new Set(semanticResults.map((e) => e.id));
    const additional = structuredResults.filter((e) => !semanticIds.has(e.id));
    return [...semanticResults, ...additional];
  }

  /**
   * Structured-first: Prefer structured results, add semantic if not present
   */
  private combineStructuredFirst(
    semanticResults: MemoryEntry[],
    structuredResults: MemoryEntry[]
  ): MemoryEntry[] {
    const structuredIds = new Set(structuredResults.map((e) => e.id));
    const additional = semanticResults.filter((e) => !structuredIds.has(e.id));
    return [...structuredResults, ...additional];
  }

  // ===== Proxy Methods for AgentDB v3 Controllers (ADR-053 #1212) =====

  /**
   * Record feedback for a memory entry.
   * Delegates to AgentDB's recordFeedback when available.
   * Gracefully degrades to a no-op when AgentDB is unavailable.
   */
  async recordFeedback(
    entryId: string,
    feedback: { score: number; label?: string; context?: Record<string, unknown> },
  ): Promise<boolean> {
    const agentdbInstance = this.agentdb.getAgentDB?.();
    if (agentdbInstance && typeof agentdbInstance.recordFeedback === 'function') {
      try {
        await agentdbInstance.recordFeedback(entryId, feedback);
        this.emit('feedback:recorded', { entryId, score: feedback.score });
        return true;
      } catch {
        // AgentDB feedback recording failed — degrade silently
      }
    }
    return false;
  }

  /**
   * Verify a witness chain for a memory entry.
   * Delegates to AgentDB's verifyWitnessChain when available.
   */
  async verifyWitnessChain(entryId: string): Promise<{
    valid: boolean;
    chainLength: number;
    errors: string[];
  }> {
    const agentdbInstance = this.agentdb.getAgentDB?.();
    if (agentdbInstance && typeof agentdbInstance.verifyWitnessChain === 'function') {
      try {
        return await agentdbInstance.verifyWitnessChain(entryId);
      } catch {
        // Verification failed — return degraded result
      }
    }
    return { valid: false, chainLength: 0, errors: ['AgentDB not available'] };
  }

  /**
   * Get the witness chain for a memory entry.
   * Delegates to AgentDB's getWitnessChain when available.
   */
  async getWitnessChain(entryId: string): Promise<Array<{
    hash: string;
    timestamp: number;
    operation: string;
  }>> {
    const agentdbInstance = this.agentdb.getAgentDB?.();
    if (agentdbInstance && typeof agentdbInstance.getWitnessChain === 'function') {
      try {
        return await agentdbInstance.getWitnessChain(entryId);
      } catch {
        // Chain retrieval failed
      }
    }
    return [];
  }

  // ===== Backend Access =====

  /**
   * Get underlying backends for advanced operations
   */
  getSQLiteBackend(): SQLiteBackend {
    return this.sqlite;
  }

  getAgentDBBackend(): AgentDBBackend {
    return this.agentdb;
  }
}

export default HybridBackend;
