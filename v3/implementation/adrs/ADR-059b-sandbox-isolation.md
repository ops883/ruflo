# ADR-059b: Sandbox Isolation and Credential Passthrough

**Status:** Proposed
**Date:** 2026-03-02
**Parent:** ADR-059 (Context Optimization Engine)
**Related:** ADR-058 (RVFA Appliance), V3 Security Architecture

## Context

The Context Optimization Engine (ADR-059) requires executing code and processing tool outputs in isolated environments. Raw outputs from tools like `gh`, `aws`, `kubectl`, and `docker` may contain sensitive data (tokens, secrets, internal URLs). The sandbox must:

1. Prevent raw outputs from entering the context window
2. Allow authenticated CLI tools to function (credential passthrough)
3. Isolate execution to prevent cross-contamination between tool calls
4. Support multiple language runtimes for versatile processing

## Decision

We will implement a **process-isolated sandbox pool** with explicit credential passthrough and runtime auto-detection.

### Sandbox Architecture

```
┌──────────────────────────────────────────┐
│              Sandbox Pool                 │
│                                          │
│  ┌────────┐  ┌────────┐  ┌────────┐    │
│  │ Warm 1 │  │ Warm 2 │  │ Warm 3 │    │   Pre-warmed slots
│  │  (JS)  │  │  (Py)  │  │ (Shell)│    │
│  └────────┘  └────────┘  └────────┘    │
│                                          │
│  ┌─────────────────────────────────┐    │
│  │         Lifecycle Manager        │    │
│  │  acquire() → execute() → release │    │
│  │  timeout: 30s  │  maxMemory: 512M │   │
│  └─────────────────────────────────┘    │
│                                          │
│  ┌─────────────────────────────────┐    │
│  │     Credential Passthrough       │    │
│  │  ENV allowlist → child_process   │    │
│  └─────────────────────────────────┘    │
└──────────────────────────────────────────┘
```

### Process Isolation Model

Each sandbox instance is a **child process** (`child_process.fork()` or `child_process.spawn()`):

```typescript
interface SandboxConfig {
  runtime: RuntimeType;
  timeout: number;         // Default: 30_000ms
  maxMemory: number;       // Default: 512MB
  maxOutputSize: number;   // Default: 10MB
  envAllowlist: string[];  // Credential passthrough
  cwd: string;             // Working directory (isolated temp)
}

type RuntimeType =
  | 'javascript' | 'typescript'  // Node.js / Bun
  | 'python'                      // python3
  | 'shell'                       // sh / bash / zsh
  | 'ruby' | 'go' | 'rust'       // Compiled runtimes
  | 'php' | 'perl' | 'r' | 'elixir';
```

**Isolation guarantees:**
- Separate process boundary (no shared memory with parent)
- Isolated temp directory per execution (cleaned on release)
- Resource limits enforced via process signals (SIGKILL on timeout/OOM)
- stdout captured as the only output channel (stderr logged but not surfaced)

### Credential Passthrough

Authenticated CLI tools require environment variables to function. The sandbox implements an **explicit allowlist** model:

```typescript
const DEFAULT_ENV_ALLOWLIST = [
  // GitHub
  'GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_ENTERPRISE_TOKEN',
  // AWS
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN',
  'AWS_REGION', 'AWS_DEFAULT_REGION', 'AWS_PROFILE',
  // Kubernetes
  'KUBECONFIG', 'KUBECTL_CONTEXT',
  // Docker
  'DOCKER_HOST', 'DOCKER_CONFIG',
  // General
  'HOME', 'USER', 'PATH', 'SHELL', 'LANG', 'LC_ALL',
  // Node.js
  'NODE_PATH', 'NODE_ENV',
  // Claude Flow
  'CLAUDE_FLOW_CONFIG', 'CLAUDE_FLOW_MEMORY_PATH',
];
```

**Security properties:**
- Only allowlisted variables are passed to child processes
- API keys and tokens are never logged or included in compressed output
- Users can extend the allowlist via configuration
- Variables not in the allowlist are silently dropped (fail-closed)

### Pool Management

```typescript
interface ISandboxPool {
  // Acquire a warm or cold sandbox
  acquire(runtime: RuntimeType): Promise<SandboxInstance>;

  // Return sandbox to pool (cleaned and recycled)
  release(instance: SandboxInstance): void;

  // Execute with automatic acquire/release
  execute(code: string, runtime: RuntimeType, options?: ExecOptions): Promise<ExecutionResult>;

  // Pool metrics
  getStats(): PoolStats;

  // Shutdown all sandboxes
  drain(): Promise<void>;
}

interface PoolStats {
  warm: number;        // Pre-warmed, idle instances
  active: number;      // Currently executing
  totalCreated: number;
  totalRecycled: number;
  avgAcquireMs: number;
}
```

**Pool sizing:**
- Default warm pool: 3 instances (JS, Python, Shell)
- Max concurrent: 8 (matching swarm maxAgents)
- Idle timeout: 60 seconds before cold shutdown
- Warm-up strategy: lazily create on first use per runtime, then keep warm

### Runtime Auto-Detection

```typescript
function detectRuntime(code: string, hint?: string): RuntimeType {
  if (hint) return hint as RuntimeType;

  // Shebang detection
  if (code.startsWith('#!/usr/bin/env python')) return 'python';
  if (code.startsWith('#!/bin/bash') || code.startsWith('#!/bin/sh')) return 'shell';

  // Syntax heuristics
  if (code.includes('import ') && code.includes('def ')) return 'python';
  if (code.includes('const ') || code.includes('async ')) return 'javascript';
  if (code.includes('interface ') && code.includes(': ')) return 'typescript';
  if (code.includes('func ') && code.includes('package ')) return 'go';

  // Default to shell for CLI-style commands
  return 'shell';
}
```

### Bun Optimization

When Bun runtime is detected on the system, JS/TS sandboxes use it for 3-5x faster execution:

```typescript
function getJSRunner(): string {
  try {
    execSync('bun --version', { stdio: 'pipe' });
    return 'bun';
  } catch {
    return 'node';
  }
}
```

## Rationale

### Why Process Isolation (Not VM/Container)

| Approach | Startup | Overhead | Security | Complexity |
|----------|---------|----------|----------|------------|
| **child_process** | **~10ms** | **Low** | **Good** | **Low** |
| VM (vm2/isolated-vm) | ~50ms | Medium | Better | Medium |
| Docker container | ~500ms | High | Best | High |
| WASM sandbox | ~5ms | Low | Good | High |

Process isolation provides the best balance of startup speed and security for our use case. Tool output processing needs to be fast (<50ms budget) and the primary threat model is preventing data leakage into context, not defending against malicious code execution.

### Why Allowlist (Not Blocklist)

Blocklisting env vars is fragile — new sensitive variables are constantly added by tools. An allowlist is fail-closed: unknown variables are excluded by default, and users explicitly opt in to passing additional credentials.

## Consequences

### Positive

- Authenticated CLI tools work transparently in sandboxes
- Process boundary prevents memory/state cross-contamination
- Pool recycling keeps warm-start latency under 10ms
- Bun optimization benefits JS-heavy workflows automatically

### Negative

- Process fork overhead (~10ms per cold start)
- Platform-specific runtime availability (Go, Rust require installed compilers)
- Credential allowlist needs maintenance as new tools emerge
- Max 8 concurrent sandboxes may bottleneck in extreme swarm scenarios

## Security Considerations

1. **Sandbox escape**: Mitigated by process isolation + resource limits + temp directory cleanup
2. **Credential exposure**: Only allowlisted env vars; stdout is the sole output channel
3. **Resource exhaustion**: Timeout (30s) and memory limit (512MB) enforced via SIGKILL
4. **Code injection**: Sandboxes execute provided code, not user-controlled strings from context
5. **Temp file cleanup**: Each execution gets a unique temp directory, deleted on release

## References

- Node.js `child_process` documentation
- ADR-058: RVFA Appliance (process isolation precedent)
- `@claude-flow/security`: InputValidator, SafeExecutor patterns
