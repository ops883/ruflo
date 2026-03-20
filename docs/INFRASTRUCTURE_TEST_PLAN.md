# MoFlo Infrastructure Test Plan

Full validation of the moflo apparatus. Run this before starting major feature work or after upgrading moflo to ensure the infrastructure is healthy.

## Quick Smoke Test

```bash
npx moflo doctor
```
**Pass criteria:** All checks pass, zero warnings.

---

## Test 1: Memory System (store/search/retrieve)

```bash
# Store a test value
npx moflo memory store --key "infra-test-$(date +%s)" --value "test value" --namespace patterns
# Search across all 3 namespaces
node .claude/scripts/semantic-search.mjs "testing memory" --namespace guidance
node .claude/scripts/semantic-search.mjs "testing memory" --namespace patterns
node .claude/scripts/semantic-search.mjs "testing memory" --namespace code-map
# Retrieve specific key
npx moflo memory retrieve --key "infra-test-*" --namespace patterns
```
**Pass criteria:** Store returns success with `Vector: Yes (384-dim)`, search returns ranked results with scores, retrieve returns stored value.

---

## Test 2: Semantic Score Quality

Run domain-specific queries against each namespace and verify scores meet minimum thresholds.

### Score thresholds

| Namespace | Model | Min Top Score | Min Top-3 Avg |
|-----------|-------|---------------|---------------|
| `guidance` | Xenova/all-MiniLM-L6-v2 | ≥ 0.40 | ≥ 0.35 |
| `patterns` | Xenova/all-MiniLM-L6-v2 | ≥ 0.40 | ≥ 0.35 |
| `code-map` | Xenova/all-MiniLM-L6-v2 | ≥ 0.40 | ≥ 0.35 |

### CRITICAL: Vectorization fallback check

**A score of exactly 0.500 means vectorization failed** and the system returned a default fallback score. Any result with score === 0.500 (or all results sharing the same score) is a FAIL — it indicates the entry was not properly embedded.
- If top-N results all share the same score, the search is degraded (hash/fallback mode)
- Valid semantic search always produces varied scores across results

### Guidance queries (Xenova model — expect 0.40–0.58)

```bash
node .claude/scripts/semantic-search.mjs "soft delete entity pattern" --namespace guidance --limit 5
node .claude/scripts/semantic-search.mjs "MikroORM migration database relations" --namespace guidance --limit 5
node .claude/scripts/semantic-search.mjs "authentication JWT token refresh" --namespace guidance --limit 5
```

### Code-map queries (Xenova model — expect 0.40–0.55)

```bash
node .claude/scripts/semantic-search.mjs "entity service route file location" --namespace code-map --limit 5
```

### Relevance spot-checks
- "soft delete entity pattern" → top result should reference soft delete or entity lifecycle
- "MikroORM migration database relations" → top result should reference Data Models or migrations
- "authentication JWT token refresh" → top result should reference tokens or auth
- "entity service route file location" → top result should be a file path (e.g., `file:...route.ts`)

**Pass criteria:**
- `[Xenova/all-MiniLM-L6-v2]` appears in output per namespace
- **No score is exactly 0.500** — that's a vectorization fallback, not real similarity
- Scores within a result set are varied (not all identical)
- Top score meets namespace threshold; top-3 average meets threshold
- At least 3 of 4 spot-checks return a contextually relevant top result

---

## Test 3: Workflow Gates

```bash
# Reset gate state for clean test
echo '{"tasksCreated":false,"taskCount":0,"memorySearched":false}' > .claude/workflow-state.json

# Memory-first gate: should block, then pass
npx moflo gate check-before-scan        # expect: silent pass (or block)
npx moflo gate record-memory-searched
npx moflo gate check-before-scan        # expect: pass

# Task-create gate: should block (exit 1), then pass after record
npx moflo gate check-before-agent       # expect: BLOCKED (exit 1)
npx moflo gate record-task-created
npx moflo gate check-before-agent       # expect: pass (exit 0)
```
**Pass criteria:** Gates block before requirements met, pass after requirements met.

---

## Test 4: Hooks (pre-task, post-task, route, session lifecycle)

```bash
# Route a task
npx moflo hooks route --task "implement user authentication"
# Pre-task + post-task
npx moflo hooks pre-task -i "test-1" -d "test task"
npx moflo hooks post-task -t "test-1"
# Session lifecycle
node .claude/helpers/hook-handler.cjs session-start
node .claude/helpers/hook-handler.cjs session-end
```
**Pass criteria:** Route returns agent recommendation with confidence %. Pre/post-task complete without error and return learning updates. Session hooks run cleanly.

---

## Test 5: Subagent Guidance Discovery

Spawn an Explore agent with an explicit guidance-discovery task. The agent must:
1. Find and read `.claude/guidance/moflo-bootstrap.md` — verify it exists and is readable
2. Find and read `.claude/guidance/core.md` — verify it exists and is readable
3. Search memory in `guidance` namespace — verify results returned with varied scores
4. Search memory in `patterns` namespace — verify results returned with varied scores

**Pass criteria:**
- Both guidance files exist and are readable
- Memory search returns ranked results for both namespaces
- Scores are varied (not all identical) — score of exactly 0.500 is a vectorization fallback FAIL
- Guidance top score ≥ 0.40, patterns top score ≥ 0.55
- Agent output confirms all 4 checks passed

---

## Test 6: Swarm / Hive-Mind Coordination

### Step 1: Initialize swarm
```bash
npx moflo swarm init --topology hierarchical --max-agents 4 --strategy specialized
```

### Step 2: Register pre-task hooks
```bash
npx moflo hooks pre-task -i "swarm-agent-alpha" -d "Explore: find entity files"
npx moflo hooks pre-task -i "swarm-agent-beta" -d "Explore: find service files"
```

### Step 3: Spawn 2 agents in parallel (both `run_in_background: true`)
Both agents should search memory before using Glob, and report exact scores.

### Step 4: Post-task hooks
```bash
npx moflo hooks post-task -t "swarm-agent-alpha"
npx moflo hooks post-task -t "swarm-agent-beta"
```

**Pass criteria:**
- Swarm initializes with correct topology
- Pre-task hooks register both tasks with routing recommendations
- Both agents run concurrently and return results independently
- Post-task hooks record SUCCESS with learning updates (patterns updated, trajectory ID)
- **Known limitation:** `swarm status` does not track Claude Code Agent-spawned tasks

---

## Test 6b: Hive-Mind Consensus

Verify the hive-mind coordination system initializes and can run consensus.

```bash
# Initialize hive-mind
npx moflo hive-mind init --topology hierarchical-mesh --consensus byzantine

# Check status (should show real agent state, not hardcoded)
npx moflo hive-mind status

# Spawn a hive node
npx moflo hive-mind join --role worker --name "test-worker-1"

# Broadcast a message
npx moflo hive-mind broadcast --message "infrastructure test ping"

# Check status again
npx moflo hive-mind status

# Shut down
npx moflo hive-mind shutdown
```

**Pass criteria:**
- Hive-mind initializes with hierarchical-mesh topology and byzantine consensus
- Status returns real state (not hardcoded values — upstream fix #1385)
- Join/broadcast/shutdown complete without error

---

## Test 7: MCP Server

```bash
npx moflo doctor
```
Also verify via ToolSearch:
```
ToolSearch("select:mcp__claude-flow__memory_search,mcp__claude-flow__memory_store,mcp__claude-flow__memory_retrieve")
```
**Pass criteria:** Either MCP tools load via ToolSearch, or CLI fallback produces equivalent results.

---

## Test 8: MCP vs CLI Memory Parity

Store via MCP, retrieve via CLI (and vice versa) to confirm both paths use the same database.

**Pass criteria:** Keys stored via one path are retrievable via the other. Search results are comparable.

---

## Test 9: SONA Learning Engine

Verify SONA initializes and can process trajectory data.

```bash
node -e "
const { SonaEngine } = require('@ruvector/sona');
const sona = new SonaEngine(384);

// Verify engine state
console.log('enabled:', sona.isEnabled());
console.log('stats:', sona.getStats());

// Force-learn a vector
const vec = Array.from({length: 384}, (_, i) => Math.sin(i * 0.1) * 0.01);
sona.forceLearn(vec);
console.log('forceLearn: OK');

// Find patterns (returns array)
const patterns = sona.findPatterns(vec, 5);
console.log('findPatterns returned:', patterns.length, 'results');

// Apply MicroLoRA through SONA
const adapted = sona.applyMicroLora(vec, 0.1);
console.log('applyMicroLora returned:', adapted.length, 'dims');

// Background tick
sona.tick();
console.log('tick: OK');

console.log('final stats:', sona.getStats());
"
```

**Pass criteria:**
- `isEnabled()` returns `true`
- `forceLearn()` completes without error
- `findPatterns()` returns an array (may be empty if no patterns stored yet)
- `applyMicroLora()` returns a 384-dim array
- `tick()` completes without error
- Stats show `instant_enabled: true, background_enabled: true`

---

## Test 10: MicroLoRA (Standalone WASM)

Verify the standalone MicroLoRA WASM module initializes and can adapt.

```bash
node -e "
const { initSync, WasmMicroLoRA } = require('@ruvector/learning-wasm');
const fs = require('fs');
const path = require('path');

// Initialize WASM
const wasmDir = path.dirname(require.resolve('@ruvector/learning-wasm'));
const wasmFile = fs.readdirSync(wasmDir).find(f => f.endsWith('.wasm'));
initSync(fs.readFileSync(path.join(wasmDir, wasmFile)));

// Create MicroLoRA (dim=384, alpha=0.1, lr=0.01)
const lora = new WasmMicroLoRA(384, 0.1, 0.01);
console.log('dim:', lora.dim());
console.log('adapt_count before:', Number(lora.adapt_count()));
console.log('delta_norm before:', lora.delta_norm());

// Adapt with a gradient
const grad = Array.from({length: 384}, (_, i) => Math.sin(i * 0.1) * 0.01);
lora.adapt(grad);
console.log('adapt_count after:', Number(lora.adapt_count()));

// Forward pass (should differ from input)
const input = Array.from({length: 384}, () => Math.random() * 0.1);
const output = lora.forward_array(input);
const differs = output.some((v, i) => Math.abs(v - input[i]) > 1e-10);
console.log('forward output dims:', output.length);
console.log('forward modifies input:', differs);

// Adapt with reward signal
lora.adapt_with_reward(grad, 0.95);
console.log('adapt_count after reward:', Number(lora.adapt_count()));

// Reset
lora.reset();
console.log('adapt_count after reset:', Number(lora.adapt_count()));
"
```

**Pass criteria:**
- WASM initializes without error
- `WasmMicroLoRA(384, 0.1, 0.01)` creates successfully
- `adapt()` increments `adapt_count` from 0 to 1
- `forward_array()` returns 384 dims and modifies input (output differs)
- `adapt_with_reward()` increments `adapt_count` to 2
- `reset()` resets `adapt_count` to 0
- Note: `dim()` returns internal LoRA rank (256), not input dimension (384)

---

## Test 11: HNSW Vector Search Engine

Verify the HNSW vector database from `@ruvector/core` initializes and performs search.

```bash
node -e "
(async () => {
const { VectorDb, JsDistanceMetric } = require('@ruvector/core');
const db = new VectorDb({ dimensions: 384, distanceMetric: JsDistanceMetric.Cosine });

// Insert test vectors (Float32Array required)
for (let i = 0; i < 5; i++) {
  const vec = new Float32Array(384);
  for (let j = 0; j < 384; j++) vec[j] = Math.sin((i + 1) * j * 0.01);
  db.insert({ key: 'test-' + i, vector: vec, metadata: JSON.stringify({label: 'item-' + i}) });
}

// Search (async, returns {id, score} objects)
const query = new Float32Array(384);
for (let j = 0; j < 384; j++) query[j] = Math.sin(3 * j * 0.01);
const results = await db.search({ vector: query, k: 3 });
console.log('Results:', results.length);
results.forEach((r, i) => console.log('  rank', i, '- score:', r.score?.toFixed(6) || 'N/A'));
})();
"
```

**Pass criteria:**
- VectorDb creates with 384 dims + Cosine metric
- 5 vectors insert without error
- Search returns 3 results with scores
- Scores are near 0 (cosine distance — closer to 0 = more similar)
