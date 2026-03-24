# Agent Catalog

Ruflo ships with 60+ specialized agents. This page documents the most commonly used ones by category. Run `npx ruflo@latest --list` for the complete list in your installation.

## Core Development

| Agent | Role |
|-------|------|
| `coder` | General-purpose code implementation |
| `architect` | System design, ADR authoring, bounded contexts |
| `tester` | Unit, integration, and end-to-end test generation |
| `reviewer` | Code review, best practices, style enforcement |
| `documenter` | Docstrings, README, API docs generation |
| `debugger` | Root cause analysis, stack trace interpretation |
| `refactorer` | Large-scale codebase restructuring |

## Quality & Security

| Agent | Role |
|-------|------|
| `security-architect` | Threat modeling, secure design patterns |
| `auditor` | CVE scanning, dependency review |
| `perf-engineer` | Profiling, bottleneck identification, optimization |
| `memory-specialist` | Memory leak detection and optimization |

## Coordination & Analysis

| Agent | Role |
|-------|------|
| `coordinator` | Queen-level task decomposition and validation |
| `researcher` | Web search, documentation lookup, context gathering |
| `analyst` | Data analysis, metrics interpretation |
| `optimizer` | Continuous improvement based on learned patterns |

## Additional Agents

The remaining agents cover specialized domains including:

- **DevOps**: CI/CD pipeline generation, Docker configuration, infrastructure-as-code
- **Database**: Schema design, migration generation, query optimization
- **Frontend**: Component generation, accessibility auditing, responsive design
- **API**: OpenAPI spec generation, endpoint testing, contract validation

!!! tip
    Run `npx ruflo@latest --list` to see every agent available in your installation, including any custom agents you've defined.

## Spawning Agents

=== "MCP (inside Claude Code)"

    ```
    agent_spawn({ type: "coder", task: "Implement OAuth2 flow" })
    ```

=== "CLI"

    ```bash
    npx ruflo@latest --agent coder --task "Implement OAuth2 flow"
    ```

## Creating Custom Agents

Place YAML files in `.claude/agents/`:

```yaml
name: my-agent
role: |
  You are a specialized agent focused on database migrations.
  Always use reversible migrations. Prefer additive changes.
skills:
  - sql
  - schema-design
```

Custom agents are immediately available after creation — no restart needed.
