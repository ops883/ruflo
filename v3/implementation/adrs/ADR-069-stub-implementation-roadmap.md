# ADR-069: Stub Implementation Roadmap — Full CLI Command Coverage

## Status

Proposed

## Context

In v3.5.43 (issue #1425, PR #1435), 22 CLI commands across 5 modules were identified as returning fake success data — hardcoded tables, spinners with no real work, fabricated metrics. They were converted to honest "not implemented" errors that return `exitCode: 1` and point users to issue #1425 for tracking.

This ADR defines the implementation plan to make these 22 commands fully functional.

## The 22 Stubs

### Module 1: config (5 stubs)

| Command | Current State | Required Implementation | Dependencies | Priority | Complexity |
|---------|--------------|------------------------|--------------|----------|------------|
| `config init` | Returns error, suggests `init --wizard` | Create `claude-flow.config.json` from wizard answers or defaults. Support `--force` overwrite, `--sparc` preset, `--v3` mode flag. Write validated JSON to project root. | Config schema (Zod), file writer with atomic writes | P0 | M |
| `config set` | Returns error, shows key/value it cannot persist | Read existing config, set value at dot-notation path (e.g. `swarm.maxAgents`), validate new value against schema, write back atomically. | Config file manager, Zod schema for value validation | P0 | S |
| `config reset` | Returns error, notes config read/write needed | Load default config template, optionally reset only a `--section` (agents, swarm, memory, mcp, providers, all). Prompt for confirmation unless `--force`. | Config file manager, default config template | P1 | S |
| `config export` | Returns error, notes config read needed | Read current config, serialize to `--output` path in `--format` (json or yaml). If no output path, write to stdout. | Config file manager, optional yaml serializer | P1 | S |
| `config import` | Returns error, shows file path it cannot import | Read external config file, validate against schema, optionally `--merge` with existing config or replace entirely. | Config file manager, Zod schema validation, deep merge utility | P1 | M |

**Note:** `config get` and `config providers` already work (they read from hardcoded defaults). They should be updated to read from the actual config file once `config init` creates one, but they are not broken stubs — they return success with reasonable data.

### Module 2: deployment (6 stubs)

| Command | Current State | Required Implementation | Dependencies | Priority | Complexity |
|---------|--------------|------------------------|--------------|----------|------------|
| `deployment deploy` | Returns error | Execute deployment to target environment. Needs: environment resolution, pre-deploy validation, artifact packaging, target integration (e.g. npm publish, Docker push, cloud deploy). Support `--dry-run`, `--force`, `--rollback-on-fail`. | Deployment target abstraction, environment registry, deployment state persistence | P2 | L |
| `deployment status` | Returns error | Read deployment state from persistence layer. Show current version, health, last deploy time per environment. Support `--watch` for live updates. | Deployment state persistence (JSON file or SQLite) | P2 | M |
| `deployment rollback` | Returns error | Restore previous deployment version. Read deployment history, identify target version (by `--version` or `--steps` back), execute rollback procedure. | Deployment history tracking, deployment state persistence | P2 | L |
| `deployment history` | Returns error | Read and display deployment history log. Filter by `--env`, limit by `--limit`. | Deployment state persistence with history log | P2 | S |
| `deployment environments` | Returns error | CRUD for deployment environments. List existing environments, create new ones with config, delete unused ones. | Environment registry (JSON config file) | P2 | M |
| `deployment logs` | Returns error | Read deployment logs from log storage. Support `--follow` for tailing, `--lines` for count, filter by `--deployment` ID or `--env`. | Log aggregation layer (file-based initially) | P2 | M |

### Module 3: migrate (4 stubs)

| Command | Current State | Required Implementation | Dependencies | Priority | Complexity |
|---------|--------------|------------------------|--------------|----------|------------|
| `migrate status` | Returns error, notes filesystem analysis needed | Scan project for v2 artifacts (`claude-flow.json`, `.claude-flow/memory`, old agent configs). Compare against v3 expected structure. Report per-component migration state (migrated, pending, not-required). | V2 artifact detection heuristics, v3 structure validation | P1 | M |
| `migrate run` | Returns error, suggests `migrate breaking` | Execute v2-to-v3 migration for selected `--target` (config, memory, agents, hooks, workflows, embeddings, all). Create backup first (unless `--backup false`). Transform file formats, move directories, update schemas. Support `--dry-run`. | V2/V3 schema transformers per target, backup manager, migration state machine | P1 | L |
| `migrate verify` | Returns error, notes integrity checks needed | Run post-migration validation. Check that v3 config is valid, memory DB is accessible, agent configs parse correctly, hooks are registered. Report pass/fail per component. Support `--fix` for auto-repair. | Config validator, memory DB health check, agent config parser | P1 | M |
| `migrate rollback` | Returns error, notes backup/restore needed | Restore from backup created by `migrate run`. List available backups if no `--backup-id` given. Confirm before restoring unless `--force`. | Backup manager with backup index | P1 | M |

**Note:** `migrate breaking` already works — it displays a hardcoded but accurate table of v3 breaking changes. It is not a stub.

### Module 4: claims (5 stubs)

| Command | Current State | Required Implementation | Dependencies | Priority | Complexity |
|---------|--------------|------------------------|--------------|----------|------------|
| `claims list` | Returns error, suggests `claims check` | Read claims config file (`.claude-flow/claims.json` or fallback paths). Display all claims, optionally filtered by `--user`, `--role`, or `--resource`. | Claims persistence layer (JSON file read) | P1 | S |
| `claims grant` | Returns error, shows claim it cannot persist | Read claims config, add claim grant for user or role. Support `--scope` (global, namespace, resource) and `--expires` for time-limited grants. Write back atomically. | Claims persistence layer (JSON file read/write), atomic file writer | P1 | M |
| `claims revoke` | Returns error, shows claim it cannot revoke | Read claims config, remove claim from user or role. Write back atomically. | Claims persistence layer (JSON file read/write) | P1 | S |
| `claims roles` | Returns error, notes claims config persistence needed | CRUD for roles. `list` shows all roles and their claims. `create` adds a new role. `delete` removes a role. `show` displays role details. | Claims persistence layer | P1 | M |
| `claims policies` | Returns error, notes claims config persistence needed | CRUD for policies. Policies define rules like rate limits, time-based access, resource scoping. Store as named policy objects in claims config. | Claims persistence layer, policy schema definition | P2 | M |

**Note:** `claims check` already works — it reads from claims config files with fallback to default policy and performs real wildcard matching. It is not a stub.

### Module 5: providers (2 stubs)

| Command | Current State | Required Implementation | Dependencies | Priority | Complexity |
|---------|--------------|------------------------|--------------|----------|------------|
| `providers configure` | Returns error, suggests env vars | Persist provider configuration (API key, default model, custom endpoint) to config file. For API keys, prefer writing to `.env` or prompting user to set env vars rather than storing in plain JSON. | Config file manager, env file writer (optional) | P0 | M |
| `providers test` | Returns error | Test actual API connectivity for each provider. For Anthropic: call messages API with minimal prompt. For OpenAI: call models list endpoint. For local providers: check process/port. Report latency and status. | HTTP client, provider-specific health check endpoints | P0 | M |

**Note:** `providers list`, `providers models`, and `providers usage` currently display hardcoded data. They are not broken (they return success), but should eventually read from real state. They are lower priority than the 2 stubs above.

## Decision

Implement in 3 phases, aligned with minor version releases:

### Phase 1: v3.6.0 — Config + Providers (7 commands)

**Rationale:** Most requested by users. `config init` + `config set` unblock the entire init/setup workflow. `providers configure` + `providers test` let users verify their API keys work.

Commands: `config init`, `config set`, `config reset`, `config export`, `config import`, `providers configure`, `providers test`

### Phase 2: v3.7.0 — Claims + Migrate (9 commands)

**Rationale:** Enables RBAC for multi-user teams and provides a real migration path for v2 users.

Commands: `claims list`, `claims grant`, `claims revoke`, `claims roles`, `claims policies`, `migrate status`, `migrate run`, `migrate verify`, `migrate rollback`

### Phase 3: v3.8.0 — Deployment (6 commands)

**Rationale:** Deployment requires the most external integration design work. Users can use existing CI/CD tools in the meantime.

Commands: `deployment deploy`, `deployment status`, `deployment rollback`, `deployment history`, `deployment environments`, `deployment logs`

## Implementation Strategy

For each command, follow this process:

1. **Define the data model** — Zod schema for config/state that the command reads and writes
2. **Implement file-based persistence** — JSON config files with atomic writes (write to `.tmp`, rename)
3. **Add input validation** — Zod parsing at command entry point, clear error messages on invalid input
4. **Write tests first (TDD)** — London School mock-first, mock the file system, test command logic in isolation
5. **Implement the command** — Replace the `#1425` error block with real logic
6. **Update CLI help text** — Remove "not implemented" references, add accurate descriptions
7. **Integration test** — End-to-end test with real file system in temp directory

## Shared Infrastructure Needed

These shared utilities must be built before or during Phase 1:

### Config File Manager
- Read JSON config from known paths (`claude-flow.config.json`, `.claude-flow/config.json`)
- Write with atomic rename (`write .tmp` then `rename`)
- Deep merge for partial updates
- Dot-notation path get/set (`swarm.maxAgents` -> `{ swarm: { maxAgents: ... } }`)
- Schema validation on every write

### Claims Persistence Layer
- Read/write `.claude-flow/claims.json`
- Schema: `{ roles: Record<string, string[]>, users: Record<string, { role, claims }>, policies: Record<string, Policy>, defaultClaims: string[] }`
- Atomic writes, same pattern as config manager
- Reuse the wildcard matching logic already in `claims check`

### Provider Health Check Abstraction
- Interface: `testProvider(name: string, config: ProviderConfig): Promise<{ ok: boolean, latencyMs: number, error?: string }>`
- Implementations per provider: Anthropic (messages API ping), OpenAI (models list), local (process check)
- Timeout handling (5s default)

### Migration State Machine
- States per component: `not-started`, `backed-up`, `migrating`, `migrated`, `verified`, `rolled-back`
- Persist state to `.claude-flow/migration-state.json`
- Backup manager: copy v2 artifacts to `.claude-flow/backups/<timestamp>/`
- Transformers per target: functions that convert v2 format to v3 format

### Default Config Template
- Complete `claude-flow.config.json` with all sections and sensible defaults
- Used by `config init` and `config reset`
- Versioned so `migrate` can detect which version a config was created with

## Consequences

### Positive
- Users get working commands instead of error messages
- Config workflow becomes fully self-service (init, set, export, import)
- Claims system enables real RBAC for teams
- Migration path from v2 becomes functional instead of theoretical
- Provider testing gives users confidence their setup works

### Negative
- Adds file I/O code paths that need error handling and testing
- Config file format becomes a compatibility surface — breaking changes need migration support
- Claims persistence in JSON files is not suitable for high-concurrency multi-process scenarios (acceptable for CLI use)

### Neutral
- Deployment commands (Phase 3) will need design decisions about supported targets — this ADR intentionally defers those decisions
- `providers list`, `providers models`, and `providers usage` still show hardcoded data after Phase 1 — they can be updated incrementally as provider config becomes real

## References

- Issue #1425: CLI commands returning fake success data
- PR #1435: Convert 22 stubs to honest errors
- ADR-064: Stub Remediation v3.5.22
- ADR-067: Critical Issue Remediation v3.5.43
