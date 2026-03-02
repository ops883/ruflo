# ADR-059a: FTS5 Knowledge Base with Three-Layer Fuzzy Search

**Status:** Proposed
**Date:** 2026-03-02
**Parent:** ADR-059 (Context Optimization Engine)
**Related:** ADR-006 (Unified Memory), ADR-009 (Hybrid Memory Backend)

## Context

The Context Optimization Engine (ADR-059) requires a searchable knowledge base to store full tool outputs that have been compressed before entering the context window. Users must be able to retrieve specific information from these stored outputs on demand.

Existing memory systems in claude-flow (AgentDB + HNSW) excel at semantic vector search but lack full-text keyword search with linguistic features like stemming, substring matching, and typo correction. Tool outputs often contain precise identifiers (function names, error codes, URLs) where exact keyword search outperforms vector similarity.

## Decision

We will implement a **SQLite FTS5-based knowledge base** with a three-layer fuzzy search fallback, operating alongside the existing HNSW semantic search.

### FTS5 Store

```typescript
// Schema
CREATE VIRTUAL TABLE knowledge_chunks USING fts5(
  content,              -- Chunk text
  heading,              -- Section heading
  source,               -- Origin (tool name, URL, file path)
  session_id,           -- Session scope for TTL eviction
  tokenize = 'porter unicode61'  -- Porter stemming + Unicode
);

// BM25 ranking (built-in to FTS5)
SELECT *, rank FROM knowledge_chunks WHERE knowledge_chunks MATCH ? ORDER BY rank;
```

### Chunking Strategy

Content is split by headings to preserve document structure:

1. **Heading detection**: Split on `#`, `##`, `###` (Markdown) and `<h1>`-`<h6>` (HTML)
2. **Code block preservation**: Never split within fenced code blocks (``` ... ```)
3. **Size limits**: Max 2048 tokens per chunk with 128-token overlap
4. **Metadata propagation**: Each chunk inherits source, session, and parent heading

### Three-Layer Search Fallback

```
Query → Layer 1: Porter Stemming (FTS5 MATCH)
              │
              ├─ Found? → Return results (matchLayer: "stemming")
              │
              ▼
        Layer 2: Trigram Substring
              │
              ├─ Found? → Return results (matchLayer: "trigram")
              │
              ▼
        Layer 3: Levenshtein Correction
              │
              └─ Correct query → Re-search → Return (matchLayer: "fuzzy")
```

**Layer 1 — Porter Stemming**: FTS5's built-in stemmer matches morphological variants. "caching" matches "cached", "caches", "cache". This handles ~80% of queries.

**Layer 2 — Trigram Substring**: For partial identifiers common in code search. "useEff" finds "useEffect", "authMid" finds "authMiddleware". Uses FTS5 trigram tokenizer on a parallel index.

**Layer 3 — Levenshtein Correction**: For typos. Computes edit distance against the FTS5 vocabulary and retries with the closest match. "kuberntes" → "kubernetes", "authentcation" → "authentication".

### Smart Snippet Extraction

Instead of arbitrary truncation, snippets are extracted around matched terms:

```typescript
interface SmartSnippet {
  text: string;          // Contextual window around match
  heading: string;       // Parent section heading
  matchLayer: string;    // Which search layer found it
  relevanceScore: number; // BM25 score
  highlightRanges: Range[]; // Term positions for highlighting
}
```

## Rationale

### Why FTS5 Over Pure HNSW

| Capability | FTS5 | HNSW |
|-----------|------|------|
| Exact keyword match | Excellent | Poor (semantic drift) |
| Code identifier search | Excellent (trigram) | Poor |
| Typo tolerance | Good (Levenshtein) | N/A |
| Semantic similarity | N/A | Excellent |
| No embedding cost | Yes (free) | No (requires embedding model) |
| Latency | <1ms | <10ms |

The two systems are complementary. FTS5 handles precision (exact terms, code symbols), HNSW handles recall (conceptually related content).

### Why Three Layers (Not Just Stemming)

Code-heavy sessions produce identifiers that stemming cannot handle:
- `useEffect` → stemming finds "effect" but misses "useEffect" as a unit
- `kubectl` → no morphological root exists
- `authMiddleware` → camelCase compounds defeat stemmers

Trigram substring matching solves these cases without the latency of embedding computation.

## Consequences

### Positive

- Sub-millisecond keyword search on indexed content
- Handles code identifiers, API names, and technical jargon
- No embedding model required (zero cost per query)
- SQLite is already a dependency (sql.js in `@claude-flow/memory`)

### Negative

- Parallel FTS5 index adds disk usage (~10-20% overhead)
- Trigram index is larger than standard FTS5 index
- Levenshtein computation is O(n*m) per vocabulary comparison (mitigated by limiting vocabulary scan)

## Implementation Notes

- Use `sql.js` (WASM) for cross-platform SQLite FTS5 support — same as `@claude-flow/memory`
- Session-scoped eviction: chunks older than `session.ttl` (default 4 hours) are automatically purged
- Trigram index uses `CREATE VIRTUAL TABLE ... USING fts5(content, tokenize='trigram')`
- Levenshtein is implemented in TypeScript (no native dependency) with early-exit optimization

## References

- [SQLite FTS5 Documentation](https://www.sqlite.org/fts5.html)
- [BM25 Ranking Algorithm](https://en.wikipedia.org/wiki/Okapi_BM25)
- [Porter Stemming Algorithm](https://tartarus.org/martin/PorterStemmer/)
- ADR-009: Hybrid Memory Backend (SQLite foundation)
