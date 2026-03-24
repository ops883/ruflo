# Anti-Drift

Multi-agent swarms can drift from their original goals as agents interact and spawn sub-workers. Ruflo v3 includes built-in anti-drift defaults.

## Why Drift Happens

In large swarms, agents may:
- Misinterpret ambiguous requirements
- Over-scope their assigned task
- Produce output that conflicts with a parallel agent's work
- Lose track of the original objective after many sub-steps

## Anti-Drift Configuration

```javascript
// These are the recommended defaults for all coding tasks
swarm_init({
  topology: "hierarchical",  // Single coordinator validates every output
  maxAgents: 8,              // Smaller team = less surface area for drift
  strategy: "specialized",   // Clear role boundaries — no overlap
  consensus: "raft"          // Leader maintains authoritative state
})
```

## Why Each Setting Matters

| Setting | Why It Prevents Drift |
|---------|----------------------|
| `hierarchical` | Coordinator validates each output against the original goal |
| `maxAgents: 6–8` | Fewer agents → less coordination overhead, easier alignment |
| `specialized` | Each agent knows exactly what to do — no ambiguous overlap |
| `raft` consensus | Single leader, no conflicting decisions between agents |

## Additional Safeguards

- **Frequent checkpoints** — `post-task` hooks store snapshots after each agent completes
- **Shared memory namespace** — all agents read/write the same context; contradictions surface early
- **Short task cycles** — agents work in small increments with verification gates
- **Progress hook** — validates ADR spec compliance; blocks merges that violate specifications

## Spec-First Development

The best anti-drift tool is a clear spec written before agents start:

1. Define Architecture Decision Records (ADRs) for key choices
2. Set bounded contexts so agents know their scope
3. Use the `coordinator` agent to enforce spec compliance across the swarm
4. Run `hooks progress` regularly to detect drift before it compounds

## Detecting Drift

```bash
# Check ADR compliance %
npx ruflo@latest hooks progress

# View agent memory divergence
npx ruflo@latest hooks intelligence --status
```

If compliance drops below 80%, spawn a `reviewer` agent to audit and correct.
