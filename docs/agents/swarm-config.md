# Swarm Configuration

## Basic Initialization

```javascript
swarm_init({
  topology: "hierarchical",   // hierarchical | mesh | ring | star
  maxAgents: 6,               // recommended: 6–8 for most tasks
  strategy: "specialized"     // specialized | generalist
})
```

## Full Configuration Reference

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `topology` | string | `hierarchical` | Agent coordination pattern |
| `maxAgents` | number | `5` | Maximum concurrent agents |
| `strategy` | string | `specialized` | How to assign agent roles |
| `consensus` | string | `raft` | Consensus algorithm |
| `checkpointInterval` | number | `10` | Steps between checkpoints |
| `memoryNamespace` | string | `default` | Shared memory namespace |

## Consensus Algorithm Selection

```javascript
// For most tasks — authoritative leader maintains state
swarm_init({ consensus: "raft" })

// For untrusted or noisy agents
swarm_init({ consensus: "byzantine" })

// For eventually-consistent distributed state
swarm_init({ consensus: "gossip" })
```

## Task Routing by Complexity

```javascript
// Bug fix — small, focused team
swarm_init({ topology: "hierarchical", maxAgents: 4 })
agent_spawn({ type: "coordinator" })
agent_spawn({ type: "researcher" })
agent_spawn({ type: "coder" })
agent_spawn({ type: "tester" })

// New feature — cross-functional team
swarm_init({ topology: "hierarchical", maxAgents: 6 })
agent_spawn({ type: "coordinator" })
agent_spawn({ type: "architect" })
agent_spawn({ type: "coder" })
agent_spawn({ type: "tester" })
agent_spawn({ type: "reviewer" })

// Security audit — specialized pipeline
swarm_init({ topology: "hierarchical", maxAgents: 4, consensus: "byzantine" })
agent_spawn({ type: "coordinator" })
agent_spawn({ type: "security-architect" })
agent_spawn({ type: "auditor" })
```

## Monitoring Swarm State

```bash
# Check hook intelligence (includes swarm status)
npx ruflo@latest hooks intelligence --status

# Check progress (validates ADR compliance)
npx ruflo@latest hooks progress
```
