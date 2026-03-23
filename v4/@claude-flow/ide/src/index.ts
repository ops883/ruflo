/**
 * @claude-flow/ide - IDE Integration Layer for Ruflo v4
 *
 * Provides integrations for Antigravity, Cursor, cloud IDEs (Gitpod,
 * Codespaces, StackBlitz), VSCode LSP, and anti-gravity git worktrees.
 *
 * @module @claude-flow/ide
 *
 * @example
 * ```typescript
 * import { AntigravityMCPBridge, CursorMCPBridge, WorktreeManager } from '@claude-flow/ide';
 *
 * // Set up Antigravity MCP integration
 * const bridge = new AntigravityMCPBridge();
 * bridge.init('/workspace');
 *
 * // Set up Cursor
 * const cursorBridge = new CursorMCPBridge();
 * cursorBridge.init('/workspace');
 *
 * // Create per-agent workspaces
 * const wm = new WorktreeManager({ repoRoot: '/workspace' });
 * const workspace = await wm.createWorkspace('agent-1', 'task-42');
 * ```
 */

// ── Antigravity ──────────────────────────────────────────────────────────────
export {
  AntigravityMCPBridge,
  type AntigravityMCPConfig,
  type AntigravityMCPServer,
  type MCPToolDefinition,
  type RufloMCPServer,
} from './antigravity/mcp-bridge.js';

export {
  MissionControlSync,
  type AgentStatus,
  type AgentState,
  type AntigravityAgentEvent,
  type MissionControlMessage,
  type MissionControlSyncOptions,
} from './antigravity/mission-control.js';

export {
  MemoryInjector,
  type MemorySearchResult,
  type MemoryInjectorOptions,
} from './antigravity/memory-injector.js';

export {
  AntigravityWorktreeAdapter,
  type AgentWorkspaceMapping,
  type WorktreeAdapterOptions,
} from './antigravity/worktree-adapter.js';

export {
  GuidanceOverlay,
  type ConstitutionRule,
  type Constitution,
  type GuidanceOverlayOptions,
} from './antigravity/guidance-overlay.js';

// ── Cursor ───────────────────────────────────────────────────────────────────
export {
  CursorMCPBridge,
  type CursorMCPConfig,
  type CursorMCPServerEntry,
  type CursorMCPBridgeOptions,
} from './cursor/mcp-bridge.js';

export {
  CursorRulesGenerator,
  type GovernanceRule,
  type GovernanceConstitution,
  type CursorRulesGeneratorOptions,
} from './cursor/cursorrules-gen.js';

// ── Cloud IDE ────────────────────────────────────────────────────────────────
export {
  DevcontainerBridge,
  type CloudEnvironment,
  type DevcontainerFeature,
  type DevcontainerConfig,
  type DevcontainerBridgeOptions,
} from './cloud/devcontainer-bridge.js';

export {
  FSWatcher,
  fsWatcher,
  type FileEditedEvent,
  type SecurityTriggerEvent,
  type TestTriggerEvent,
  type FSWatcherEvent,
  type FSWatcherOptions,
} from './cloud/fs-watcher.js';

// ── Workspace ────────────────────────────────────────────────────────────────
export {
  WorktreeManager,
  type WorkspaceInfo,
  type WorktreeManagerOptions,
} from './workspace/worktree-manager.js';

export {
  MergeCoordinator,
  type ConflictResolution,
  type MergeResult,
  type MergeCoordinatorOptions,
} from './workspace/merge-coordinator.js';

// ── VSCode / LSP ─────────────────────────────────────────────────────────────
export {
  RufloLSPServer,
  type Diagnostic,
  type HoverInfo,
  type RufloLSPServerOptions,
} from './vscode/lsp-server.js';
