# MoFlo

**AI agent orchestration for Claude Code.** MoFlo gives your project semantic memory, workflow enforcement, learned routing, and automated issue execution — install it as a dev dependency and run `flo init`.

Forked from [ruflo/claude-flow](https://github.com/ruvnet/ruflo) with all patches applied to source and wrapper scripts merged into the CLI.

## Features

| Feature | What It Does |
|---------|-------------|
| **Semantic Memory** | 384-dim domain-aware embeddings. Store knowledge, search it instantly. |
| **Code Navigation** | Indexes your codebase structure so Claude can answer "where does X live?" without Glob/Grep. |
| **Guidance Indexing** | Chunks your project docs (`.claude/guidance/`, `docs/`) and makes them searchable. |
| **Workflow Gates** | Enforces memory-first and task-creation patterns via Claude Code hooks. Prevents Claude from skipping steps. |
| **Learned Routing** | Routes tasks to the right agent type. Learns from outcomes — gets better over time. |
| **`/flo` Skill** | Execute GitHub issues through a full workflow: research → enhance → implement → test → simplify → PR. (Also available as `/fl`.) |
| **Context Tracking** | Monitors context window usage (FRESH → MODERATE → DEPLETED → CRITICAL) and advises accordingly. |
| **Cross-Platform** | Works on macOS, Linux, and Windows. |

## Quick Start

```bash
# Install as a dev dependency
npm install --save-dev moflo

# Initialize your project (generates config, hooks, skill, CLAUDE.md section)
npx flo init

# Index your project's knowledge base
npx flo memory index-guidance
npx flo memory code-map

# Verify everything works
npx flo doctor
```

That's it. `flo init` sets up everything:
- `moflo.yaml` — project config (auto-detects source dirs, languages, guidance paths)
- `.claude/settings.json` — workflow gate hooks
- `.claude/skills/flo/` — the `/flo` issue execution skill (with `/fl` alias)
- `CLAUDE.md` — appends a MoFlo workflow section so Claude knows how to use it
- `.gitignore` — adds state directories

## Commands

### Memory

```bash
flo memory store -k "key" --value "data"    # Store with 384-dim embedding
flo memory search -q "auth patterns"         # Semantic search
flo memory index-guidance                    # Index guidance docs
flo memory code-map                          # Index code structure
flo memory rebuild-index                     # Regenerate all embeddings
flo memory stats                             # Show statistics
```

### Routing & Learning

```bash
flo hooks route --task "description"          # Route task to optimal agent
flo hooks learn --pattern "..." --domain "."  # Store a pattern
flo hooks patterns                            # List learned patterns
flo hooks consolidate                         # Promote/prune patterns
```

### Workflow Gates

```bash
flo gate check-before-scan       # Blocks Glob/Grep if memory not searched
flo gate check-before-agent      # Blocks Agent tool if no TaskCreate
flo gate prompt-reminder         # Context bracket tracking
flo gate session-reset           # Reset workflow state
```

### Feature Orchestration

Sequence multiple GitHub issues through `/flo` workflows using a YAML definition:

```bash
flo orc run feature.yaml              # Execute a feature (stories in dependency order)
flo orc run feature.yaml --dry-run    # Show execution plan without running
flo orc run feature.yaml --verbose    # Execute with Claude output streaming
flo orc status my-feature             # Check progress of a feature
flo orc reset my-feature              # Reset feature state for re-run
```

Feature YAML example:

```yaml
feature:
  id: my-feature
  name: "My Feature"
  repository: /path/to/project
  base_branch: main

  stories:
    - id: story-1
      name: "Entity and service"
      issue: 101

    - id: story-2
      name: "Routes and tests"
      issue: 102
      depends_on: [story-1]
```

Stories are resolved via topological sort (respecting `depends_on`), then executed sequentially by spawning `claude -p "/flo <issue>"`.

### System

```bash
flo init                          # Initialize project (one-time setup)
flo doctor                       # Health check
flo --version                    # Show version
```

## Configuration

`flo init` generates a `moflo.yaml` at your project root:

```yaml
project:
  name: "my-project"

guidance:
  directories: [.claude/guidance]    # Where your knowledge docs live
  namespace: guidance

code_map:
  directories: [src, packages]       # Source dirs to index
  extensions: [".ts", ".tsx"]        # Auto-detected from your project
  exclude: [node_modules, dist]
  namespace: code-map

gates:
  memory_first: true                 # Must search memory before file exploration
  task_create_first: true            # Must TaskCreate before Agent tool
  context_tracking: true             # Track context window depletion

auto_index:
  guidance: true                     # Auto-index docs on session start
  code_map: true                     # Auto-index code on session start

# Hook toggles (all on by default — disable to slim down)
hooks:
  pre_edit: true                     # Track file edits for learning
  post_edit: true                    # Record edit outcomes, train neural patterns
  pre_task: true                     # Get agent routing before task spawn
  post_task: true                    # Record task results for learning
  gate: true                         # Workflow gate enforcement
  route: true                        # Intelligent task routing on each prompt
  stop_hook: true                    # Session-end persistence
  session_restore: true              # Restore session state on start
  notification: true                 # Hook into Claude Code notifications

models:
  default: opus        # General tasks
  research: sonnet     # Research/exploration agents
  review: opus         # Code review agents
  test: sonnet         # Test-writing agents

# Optional: intelligent model routing (off by default)
model_routing:
  enabled: false                   # Set to true to enable
  confidence_threshold: 0.85
  cost_optimization: true
  circuit_breaker: true

# Status line display
status_line:
  enabled: true
  branding: "Moflo V4"
  mode: single-line                # single-line or dashboard
  show_git: true
  show_model: true
  show_session: true
  show_intelligence: true
  show_swarm: true
  show_hooks: true
  show_mcp: true
```

### Model Routing

By default, MoFlo uses **static model preferences** — each agent role uses the model specified in `models:`. This is predictable and gives you full control.

Set `model_routing.enabled: true` to enable **intelligent routing**, which analyzes each task's complexity and auto-selects the cheapest capable model:

| Complexity | Model | Example Tasks |
|-----------|-------|---------------|
| Low | Haiku | Typos, renames, config changes, formatting |
| Medium | Sonnet | Implement features, write tests, fix bugs |
| High | Opus | Architecture, security audits, complex debugging |

The router learns from outcomes — if a model fails a task, the circuit breaker penalizes it and escalates to a more capable model.

You can pin specific agents even when routing is enabled:

```yaml
model_routing:
  enabled: true
  agent_overrides:
    security-architect: opus     # Never downgrade security work
    researcher: sonnet           # Pin research to sonnet
```

## How It Works

MoFlo sits between Claude Code and your project. It uses Claude Code's native hook system to enforce good habits, store knowledge, and learn from outcomes — so Claude gets better at working in your codebase over time.

### The Gate System

MoFlo installs Claude Code hooks that run on every tool call. Together, these gates create a **feedback loop** that prevents Claude from wasting tokens on blind exploration and ensures it builds on prior knowledge.

**Memory-first gate** — Before Claude can use Glob, Grep, or Read on guidance files, it must first search the memory database. This forces Claude to check what it already knows (or what was learned in prior sessions) before re-exploring from scratch. The gate automatically classifies each prompt — simple directives like "commit" or "yes" skip the gate, while task-oriented prompts like "fix the auth bug" enforce it.

**Task-create gate** — Before Claude can spawn sub-agents via the Task tool, it must call TaskCreate first. This ensures every agent spawn is tracked, preventing runaway agent proliferation and making it possible to review what work was delegated.

**Context tracking** — Each interaction increments a counter. As the conversation grows, MoFlo warns Claude about context depletion (FRESH → MODERATE → DEPLETED → CRITICAL) and advises it to checkpoint progress, compact, or start a fresh session before quality degrades.

**Routing** — On each prompt, MoFlo's route hook analyzes the task and recommends the optimal agent type and model tier (haiku for simple tasks, sonnet for moderate, opus for complex). This saves cost without sacrificing quality.

All gates are configurable via `moflo.yaml` — you can disable any individual hook if it doesn't suit your workflow.

### The Task System

MoFlo integrates Claude Code's native Task tool with its own coordination layer:

1. **Pre-task hook** — Before a sub-agent spawns, MoFlo records what's about to happen and can inject context (prior learnings, routing recommendations) into the agent's prompt.
2. **Post-task hook** — After a sub-agent completes, MoFlo records the outcome. Successful patterns are stored in the memory database for future reference. Failed patterns feed into the routing circuit breaker.
3. **The `/flo` skill** — Wraps the entire lifecycle of a GitHub issue: research the issue → enhance the ticket → implement the solution → run tests → simplify the code → create a PR. Each phase can use sub-agents, and all learning feeds back into memory.

### Memory & Knowledge Storage

MoFlo uses a SQLite database (via sql.js/WASM — no native deps) to store three types of knowledge:

| Namespace | What's Stored | How It Gets There |
|-----------|---------------|-------------------|
| `guidance` | Chunked project docs (`.claude/guidance/`, `docs/`) with 384-dim embeddings | `flo-index` on session start |
| `code-map` | Structural index of source files (exports, classes, functions) | `flo-codemap` on session start |
| `patterns` | Learned patterns from successful task outcomes | Post-task hooks after agent work |

**Semantic search** uses cosine similarity on neural embeddings (MiniLM-L6-v2, 384 dimensions). When Claude searches memory, it gets the most relevant chunks ranked by semantic similarity — not keyword matching.

**Session start indexing** — Three background processes run on every session start: the guidance indexer, the code map generator, and the learning service. All three are incremental (unchanged files are skipped) and run in parallel so they don't block the session.

**Cross-session persistence** — Everything stored in the database survives across sessions. Patterns learned on Monday are available on Friday. The stop hook exports session metrics, and the session-restore hook loads prior state.

### For Claude

When `flo init` runs, it appends a workflow section to your CLAUDE.md that teaches Claude:
- Always search memory before Glob/Grep/Read (enforced by gates)
- Use `mcp__claude-flow__memory_search` for knowledge retrieval
- Use `/flo <issue>` (or `/fl`) for issue execution
- Store learnings after task completion

## Architecture

MoFlo is a maintained fork of [ruflo 3.x](https://github.com/ruvnet/ruflo) with:

- **3 patches applied to TypeScript source** (no more monkey-patching node_modules):
  - 384-dim domain-aware embeddings for consistent CLI ↔ MCP search
  - `windowsHide: true` on all spawn/exec calls (Windows UX)
  - Routing learned patterns (task outcomes feed back into routing)
- **7 standalone bin scripts** shipped with npm: `flo-search`, `flo-embeddings`, `flo-index`, `flo-codemap`, `flo-learn`, `flo-setup`, plus the main `flo` CLI
- **Project config system**: `moflo.yaml` for per-project settings
- **One-stop init**: `flo init` generates everything needed for OOTB operation

Upstream remote preserved for cherry-picking future ruflo fixes.

## License

MIT (inherited from [upstream](https://github.com/ruvnet/ruflo))
