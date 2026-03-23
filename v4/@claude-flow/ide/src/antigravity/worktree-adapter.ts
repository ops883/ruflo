/**
 * @claude-flow/ide - Antigravity Worktree Adapter
 *
 * Maps Antigravity per-agent workspace IDs to Ruflo anti-gravity worktrees.
 * Each Antigravity agent gets its own isolated git worktree so changes do not
 * collide. The adapter keeps a bidirectional ID mapping in memory.
 */

import { EventEmitter } from 'node:events';
import { WorktreeManager, WorkspaceInfo } from '../workspace/worktree-manager.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WorktreeAdapterOptions {
  /** Root of the git repository */
  repoRoot?: string;
  /** WorktreeManager instance to delegate to (injectable for testing) */
  manager?: WorktreeManager;
}

export interface AgentWorkspaceMapping {
  antigravityAgentId: string;
  rufloWorktreeId: string;
  path: string;
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

export class AntigravityWorktreeAdapter extends EventEmitter {
  private readonly manager: WorktreeManager;
  /** Maps Antigravity agent ID → Ruflo worktree ID */
  private readonly idMap = new Map<string, string>();
  /** Maps Antigravity agent ID → AgentWorkspaceMapping */
  private readonly mappings = new Map<string, AgentWorkspaceMapping>();

  constructor(options: WorktreeAdapterOptions = {}) {
    super();
    this.manager = options.manager ?? new WorktreeManager({ repoRoot: options.repoRoot });
  }

  /**
   * Creates a new git worktree for the given Antigravity agent.
   * Returns the absolute path of the new workspace.
   */
  async createAgentWorkspace(antigravityAgentId: string): Promise<string> {
    if (this.idMap.has(antigravityAgentId)) {
      // Workspace already exists — return existing path
      return this.getWorkspacePath(antigravityAgentId);
    }

    const rufloId = this.deriveRufloId(antigravityAgentId);
    const taskId = `antigravity-${Date.now()}`;

    let info: WorkspaceInfo;
    try {
      info = await this.manager.createWorkspace(rufloId, taskId);
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }

    this.idMap.set(antigravityAgentId, rufloId);
    const mapping: AgentWorkspaceMapping = {
      antigravityAgentId,
      rufloWorktreeId: rufloId,
      path: info.path,
      createdAt: new Date(),
    };
    this.mappings.set(antigravityAgentId, mapping);

    this.emit('workspaceCreated', mapping);
    return info.path;
  }

  /**
   * Returns the workspace path for a given Antigravity agent.
   * Throws if the workspace has not been created yet.
   */
  getWorkspacePath(antigravityAgentId: string): string {
    const mapping = this.mappings.get(antigravityAgentId);
    if (!mapping) {
      throw new Error(
        `No workspace found for Antigravity agent ${antigravityAgentId}. Call createAgentWorkspace first.`,
      );
    }
    return mapping.path;
  }

  /**
   * Removes the git worktree associated with the given Antigravity agent.
   */
  async cleanupWorkspace(antigravityAgentId: string): Promise<void> {
    const rufloId = this.idMap.get(antigravityAgentId);
    if (!rufloId) {
      return; // Nothing to clean up
    }

    try {
      await this.manager.removeWorkspace(rufloId);
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }

    this.idMap.delete(antigravityAgentId);
    this.mappings.delete(antigravityAgentId);

    this.emit('workspaceRemoved', antigravityAgentId);
  }

  /**
   * Returns all active workspace mappings.
   */
  listWorkspaces(): AgentWorkspaceMapping[] {
    return Array.from(this.mappings.values());
  }

  /**
   * Returns the Ruflo worktree ID for a given Antigravity agent ID,
   * or undefined if no workspace exists for that agent.
   */
  getRufloId(antigravityAgentId: string): string | undefined {
    return this.idMap.get(antigravityAgentId);
  }

  /**
   * Cleans up all workspaces in parallel. Errors are collected and
   * rethrown as an AggregateError after all removals are attempted.
   */
  async cleanupAll(): Promise<void> {
    const agentIds = Array.from(this.idMap.keys());
    const errors: Error[] = [];

    await Promise.all(
      agentIds.map(async (id) => {
        try {
          await this.cleanupWorkspace(id);
        } catch (err) {
          errors.push(err instanceof Error ? err : new Error(String(err)));
        }
      }),
    );

    if (errors.length > 0) {
      throw new AggregateError(errors, `${errors.length} workspace cleanup(s) failed`);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Converts an Antigravity agent ID into a Ruflo-friendly identifier.
   * Antigravity IDs may contain characters not valid in branch names, so we
   * sanitise them.
   */
  private deriveRufloId(antigravityAgentId: string): string {
    const sanitised = antigravityAgentId
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return `ag-${sanitised}`;
  }
}
