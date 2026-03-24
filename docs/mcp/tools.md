# MCP Tool Reference

Ruflo exposes 259 MCP tools. Below are the most commonly used.

## Core Tools

### `swarm_init`
Initialize an agent swarm.

```json
{
  "topology": "hierarchical",
  "maxAgents": 6,
  "strategy": "specialized",
  "consensus": "raft"
}
```

### `agent_spawn`
Register and spawn a specialized agent.

```json
{
  "type": "coder",
  "task": "Implement user authentication with JWT",
  "memoryNamespace": "auth-project"
}
```

### `memory_search`
Semantic vector search over learned patterns.

```json
{
  "query": "authentication patterns",
  "topK": 5,
  "minScore": 0.7
}
```

Returns patterns ranked by relevance (0–1 score).

### `memory_store`
Persist a pattern for future retrieval.

```json
{
  "key": "jwt-refresh-pattern",
  "value": "Use sliding window refresh with 7d expiry",
  "namespace": "patterns"
}
```

### `hooks_route`
Manually trigger task routing.

```json
{
  "task": "Convert all var declarations to const",
  "complexity": "simple"
}
```

### `neural_train`
Train on accumulated patterns.

```json
{
  "namespace": "patterns",
  "epochs": 5
}
```

## AgentDB Tools

| Tool | Description |
|------|-------------|
| `agentdb_hierarchical-store` | Store to working/episodic/semantic tier |
| `agentdb_hierarchical-recall` | Recall with Ebbinghaus-weighted scoring |
| `agentdb_consolidate` | Cluster and merge related memories |
| `agentdb_batch` | Bulk insert/update/delete |
| `agentdb_context-synthesize` | Auto-generate context summaries |
| `agentdb_semantic-route` | Route a task via vector similarity |
| `agentdb_pattern-store` | Store to ReasoningBank |
| `agentdb_pattern-search` | BM25+semantic hybrid search |
| `agentdb_causal-edge` | Add a causal relationship between memories |

## Hooks Tools

| Tool | Description |
|------|-------------|
| `hooks_pre_task` | Pre-task analysis and routing |
| `hooks_post_task` | Post-task pattern storage |
| `hooks_progress` | Check ADR compliance % |
| `hooks_intelligence` | Full status: agents, memory, routing accuracy |

## Full Tool List

The complete list of 259 tools is available by running:

```bash
npx ruflo@latest mcp list-tools
```
