# SPARC PRD: Context Window Optimization Engine

**Version:** 1.0.0
**Date:** 2026-03-02
**Status:** Proposed
**Author:** Claude Flow Team
**Related ADRs:** ADR-059, ADR-059a, ADR-059b, ADR-059c

---

## Specification

### Problem Statement

Every MCP tool call in Claude Code dumps raw data into the 200K token context window. In practice:

- A single Playwright snapshot consumes **56 KB** of context
- Fetching 20 GitHub issues consumes **59 KB**
- A typical swarm session with 6-8 agents exhausts usable context within **30 minutes**
- Multi-agent orchestration compounds the problem: 8 agents × uncompressed outputs = 8x context drain

This is the single largest operational bottleneck for long-running claude-flow sessions, swarm coordination, and complex multi-step workflows.

### Desired Outcome

A native **Context Optimization Engine** integrated into claude-flow/ruflo that:

1. Compresses tool outputs before they enter any agent's context window
2. Achieves **95-98% context reduction** on average across tool types
3. Extends effective session duration from ~30 minutes to **~3 hours**
4. Works transparently with existing MCP tools, hooks, and swarm agents
5. Provides a searchable knowledge base for indexed session artifacts

### Prior Art

This feature is inspired by and builds upon the mechanisms in [claude-context-mode](https://github.com/mksglu/claude-context-mode) by Mert Koseoglu, which demonstrates:

- 98% context reduction (315 KB → 5.4 KB per session)
- Sandbox-isolated execution across 11 language runtimes
- SQLite FTS5 knowledge base with BM25 ranking
- Three-layer fuzzy search (Porter stemming → trigram → Levenshtein)
- Progressive throttling to encourage batched operations
- Subagent prompt injection for automatic routing

---

## Pseudocode

### Core Compression Pipeline

```
FUNCTION compressToolOutput(rawOutput, intent, options):
    IF rawOutput.size < THRESHOLD_BYTES:
        RETURN rawOutput  // small outputs pass through

    // Stage 1: Sandbox execution (isolate raw data)
    sandbox = SandboxPool.acquire(runtime=detectRuntime(rawOutput))
    processedOutput = sandbox.execute(rawOutput)
    SandboxPool.release(sandbox)

    // Stage 2: Intent-driven filtering
    IF intent IS PROVIDED AND processedOutput.size > INTENT_THRESHOLD:
        index = FTS5Index.createTransient(processedOutput)
        relevantChunks = index.search(intent, limit=MAX_CHUNKS)
        processedOutput = relevantChunks.join()

    // Stage 3: Smart snippet extraction
    summary = SnippetExtractor.extract(processedOutput, {
        maxTokens: options.maxTokens || DEFAULT_MAX_TOKENS,
        preserveStructure: true,
        includeSearchableVocabulary: true
    })

    // Stage 4: Metrics tracking
    Metrics.record({
        tool: options.toolName,
        rawSize: rawOutput.size,
        compressedSize: summary.size,
        reductionRatio: 1 - (summary.size / rawOutput.size)
    })

    RETURN summary
```

### Knowledge Base Indexing

```
FUNCTION indexContent(content, metadata):
    chunks = ChunkStrategy.byHeadings(content, {
        preserveCodeBlocks: true,
        maxChunkSize: 2048,
        overlapTokens: 128
    })

    FOR EACH chunk IN chunks:
        FTS5Store.insert({
            content: chunk.text,
            heading: chunk.heading,
            source: metadata.source,
            timestamp: now(),
            embeddings: IF HNSW_AVAILABLE THEN computeEmbedding(chunk.text) ELSE null
        })

    RETURN { chunksIndexed: chunks.length, searchable: true }
```

### Search with Three-Layer Fallback

```
FUNCTION search(queries, options):
    results = []
    FOR EACH query IN queries:
        // Layer 1: Porter stemming (FTS5 native)
        matches = FTS5Store.match(query, stemmer="porter")
        IF matches.length > 0:
            results.push({ matches, matchLayer: "stemming" })
            CONTINUE

        // Layer 2: Trigram substring
        matches = FTS5Store.trigramSearch(query)
        IF matches.length > 0:
            results.push({ matches, matchLayer: "trigram" })
            CONTINUE

        // Layer 3: Levenshtein fuzzy correction
        corrected = LevenshteinCorrector.correct(query, FTS5Store.vocabulary())
        matches = FTS5Store.match(corrected)
        results.push({ matches, matchLayer: "fuzzy", correctedQuery: corrected })

    RETURN results
```

---

## Architecture

### System Context (C4 Level 1)

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Code Session                      │
│                                                              │
│  ┌──────────┐   ┌──────────────────────┐   ┌─────────────┐ │
│  │  Agent 1  │──▶│  Context Optimization │──▶│  Compressed │ │
│  │  Agent 2  │──▶│       Engine          │──▶│   Context   │ │
│  │  Agent N  │──▶│                       │──▶│   Window    │ │
│  └──────────┘   └──────────┬───────────┘   └─────────────┘ │
│                             │                                │
│                  ┌──────────▼───────────┐                    │
│                  │   Knowledge Base     │                    │
│                  │   (FTS5 + HNSW)      │                    │
│                  └──────────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

### Container Diagram (C4 Level 2)

```
┌─────────────────────────────────────────────────────────────────┐
│                  Context Optimization Engine                      │
│                                                                   │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │  Compression     │  │   Knowledge      │  │   Sandbox      │  │
│  │  Pipeline        │  │   Base           │  │   Pool         │  │
│  │                  │  │                  │  │                │  │
│  │  - Intent Filter │  │  - FTS5 Store    │  │  - JS/TS/Py    │  │
│  │  - Snippet Ext.  │  │  - HNSW Index    │  │  - Shell/Go    │  │
│  │  - Throttle Mgr  │  │  - Chunk Engine  │  │  - Rust/Ruby   │  │
│  │  - Metrics       │  │  - Fuzzy Search  │  │  - Process Iso │  │
│  └────────┬────────┘  └────────┬─────────┘  └───────┬────────┘  │
│           │                    │                      │           │
│  ┌────────▼────────────────────▼──────────────────────▼────────┐ │
│  │                    Hook Integration Layer                    │ │
│  │  PreToolUse · PostToolUse · SubagentRouting · SessionTrack  │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Integration with Claude Flow V3

```
claude-flow v3 architecture
├── @claude-flow/cli           ← New commands: context-mode:stats, doctor, upgrade
├── @claude-flow/hooks         ← PreToolUse hook for automatic output routing
├── @claude-flow/memory        ← HNSW integration for semantic knowledge search
├── @claude-flow/context       ← NEW PACKAGE: Context Optimization Engine
│   ├── compression/           ← Pipeline, intent filter, snippet extractor
│   ├── knowledge-base/        ← FTS5 store, chunking, fuzzy search
│   ├── sandbox/               ← Process isolation, runtime detection
│   ├── metrics/               ← Session tracking, per-tool stats
│   └── hooks/                 ← PreToolUse, PostToolUse, subagent routing
└── @claude-flow/security      ← Credential passthrough validation
```

---

## Refinement

### Phased Delivery

#### Phase 1: Core Compression (Week 1-2)

| Deliverable | Description | Priority |
|-------------|-------------|----------|
| Compression Pipeline | Intent-driven filtering + smart snippets | P0 |
| Hook Integration | PreToolUse/PostToolUse automatic routing | P0 |
| Metrics Tracking | Per-tool compression stats and session totals | P0 |
| CLI Commands | `context stats`, `context doctor` | P1 |

#### Phase 2: Knowledge Base (Week 3-4)

| Deliverable | Description | Priority |
|-------------|-------------|----------|
| FTS5 Store | SQLite full-text search with BM25 ranking | P0 |
| Chunking Engine | Heading-aware chunking with code block preservation | P0 |
| Three-Layer Search | Porter stemming → trigram → Levenshtein fallback | P1 |
| HNSW Integration | Semantic search via existing @claude-flow/memory | P1 |

#### Phase 3: Sandbox & Multi-Runtime (Week 5-6)

| Deliverable | Description | Priority |
|-------------|-------------|----------|
| Sandbox Pool | Process-isolated execution with credential passthrough | P0 |
| Runtime Detection | Auto-detect JS/TS/Python/Shell/Go/Rust/Ruby | P1 |
| Batch Execute | Multi-command compression in single call | P1 |
| Bun Optimization | 3-5x faster JS/TS when Bun is available | P2 |

#### Phase 4: Swarm Integration (Week 7-8)

| Deliverable | Description | Priority |
|-------------|-------------|----------|
| Agent Context Budgets | Per-agent context allocation and tracking | P0 |
| Subagent Routing | Auto-inject compression instructions into subagents | P0 |
| Progressive Throttling | Staged limits encouraging batch operations | P1 |
| Cross-Agent Knowledge | Shared FTS5 index across swarm agents | P1 |

### Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Context Reduction | ≥95% average | `context stats` per-session |
| Session Duration | ≥2.5 hours before slowdown | Time-to-depletion measurement |
| Compression Latency | <50ms per tool call | P99 latency tracking |
| Knowledge Search | <10ms per query | FTS5 + HNSW benchmark |
| Swarm Savings | ≥90% across 8-agent swarm | Aggregate metrics |
| Zero Breaking Changes | 100% backward compatibility | Existing test suites pass |

### Non-Goals (Explicit Exclusions)

- **Not a general-purpose compression library** — focused exclusively on MCP tool output
- **Not replacing existing memory systems** — complements AgentDB/HNSW, does not replace
- **Not modifying upstream Claude Code behavior** — operates as transparent middleware
- **Not supporting non-MCP tools** — scope limited to MCP tool output compression

---

## Completion

### Definition of Done

- [ ] All Phase 1-4 deliverables implemented and tested
- [ ] ≥95% context reduction verified on benchmark suite
- [ ] Integration tests passing with existing swarm configurations
- [ ] CLI commands (`context stats`, `context doctor`) documented
- [ ] DDD bounded context documented with domain model
- [ ] Performance benchmarks published
- [ ] Zero regressions in existing test suites
- [ ] Security review of sandbox isolation and credential passthrough

### Risk Register

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Over-compression loses critical data | Medium | High | Configurable thresholds + pass-through mode |
| Sandbox escape / credential leak | Low | Critical | Process isolation + env var allowlisting |
| FTS5 index growth unbounded | Medium | Medium | TTL-based eviction + session scoping |
| Latency budget exceeded | Low | Medium | Async pipeline + small-output bypass |
| Breaking existing hook chain | Low | High | Feature-flagged rollout + backward compat |

### Stakeholder Sign-Off

| Role | Name | Approval |
|------|------|----------|
| Product Owner | — | Pending |
| Tech Lead | — | Pending |
| Security Review | — | Pending |
