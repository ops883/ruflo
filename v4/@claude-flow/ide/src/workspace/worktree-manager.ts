/**
 * @claude-flow/ide - Anti-Gravity Workspace Manager
 *
 * Manages git worktrees so each Ruflo agent works in an isolated branch.
 * Worktrees are created under .claude/agent-workspaces/<agentId> on a branch
 * named agent/<taskId>/<agentId>.
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { EventEmitter } from 'node:events';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkspaceInfo {
  agentId: string;
  taskId: string;
  path: string;
  branch: string;
  createdAt: Date;
  commitHash?: string;
}

export interface WorktreeManagerOptions {
  /** Root of the git repository. Defaults to process.cwd(). */
  repoRoot?: string;
  /** Directory under repoRoot where worktrees are placed */
  worktreeBaseDir?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

export class WorktreeManager extends EventEmitter {
  private readonly repoRoot: string;
  private readonly worktreeBaseDir: string;
  /** In-memory registry: agentId → WorkspaceInfo */
  private readonly workspaces = new Map<string, WorkspaceInfo>();

  constructor(options: WorktreeManagerOptions = {}) {
    super();
    this.repoRoot = resolve(options.repoRoot ?? process.cwd());
    this.worktreeBaseDir = options.worktreeBaseDir ?? '.claude/agent-workspaces';
  }

  /**
   * Creates a new git worktree for the given agent and task.
   * Branch name: agent/<taskId>/<agentId>
   * Worktree path: <repoRoot>/<worktreeBaseDir>/<agentId>
   */
  async createWorkspace(agentId: string, taskId: string): Promise<WorkspaceInfo> {
    if (this.workspaces.has(agentId)) {
      return this.workspaces.get(agentId)!;
    }

    const sanitisedAgent = this.sanitise(agentId);
    const sanitisedTask = this.sanitise(taskId);
    const branchName = `agent/${sanitisedTask}/${sanitisedAgent}`;
    const worktreePath = join(this.repoRoot, this.worktreeBaseDir, sanitisedAgent);

    // Ensure the base directory exists inside the repo (git will not create parents)
    const baseDir = join(this.repoRoot, this.worktreeBaseDir);
    if (!existsSync(baseDir)) {
      execSync(`mkdir -p "${baseDir}"`, { cwd: this.repoRoot, stdio: 'pipe' });
    }

    // Add the worktree on a new branch
    const result = spawnSync(
      'git',
      ['worktree', 'add', worktreePath, '-b', branchName],
      { cwd: this.repoRoot, encoding: 'utf8' },
    );

    if (result.status !== 0) {
      const stderr = result.stderr ?? '';
      // If the branch already exists try without -b (checkout existing)
      if (stderr.includes('already exists')) {
        const retryResult = spawnSync(
          'git',
          ['worktree', 'add', worktreePath, branchName],
          { cwd: this.repoRoot, encoding: 'utf8' },
        );
        if (retryResult.status !== 0) {
          throw new Error(
            `git worktree add failed: ${retryResult.stderr ?? retryResult.stdout}`,
          );
        }
      } else {
        throw new Error(`git worktree add failed: ${stderr}`);
      }
    }

    const commitHash = this.getHeadCommit(worktreePath);

    const info: WorkspaceInfo = {
      agentId,
      taskId,
      path: worktreePath,
      branch: branchName,
      createdAt: new Date(),
      commitHash,
    };

    this.workspaces.set(agentId, info);
    this.emit('created', info);
    return info;
  }

  /**
   * Returns the absolute path of the workspace for the given agent.
   * Throws when no workspace exists for that agent.
   */
  getWorkspacePath(agentId: string): string {
    const info = this.workspaces.get(agentId);
    if (!info) {
      throw new Error(`No workspace registered for agent "${agentId}"`);
    }
    return info.path;
  }

  /**
   * Returns all workspace infos currently tracked in memory.
   * If the in-memory registry is empty, probes the filesystem.
   */
  async listWorkspaces(): Promise<WorkspaceInfo[]> {
    if (this.workspaces.size > 0) {
      return Array.from(this.workspaces.values());
    }
    return this.discoverFromFilesystem();
  }

  /**
   * Removes a worktree for the given agent using `git worktree remove --force`.
   */
  async removeWorkspace(agentId: string): Promise<void> {
    const info = this.workspaces.get(agentId);
    const sanitisedAgent = this.sanitise(agentId);
    const worktreePath =
      info?.path ?? join(this.repoRoot, this.worktreeBaseDir, sanitisedAgent);

    const result = spawnSync('git', ['worktree', 'remove', '--force', worktreePath], {
      cwd: this.repoRoot,
      encoding: 'utf8',
    });

    if (result.status !== 0) {
      // Worktree might already be gone — treat as success
      const stderr = result.stderr ?? '';
      if (!stderr.includes('is not a working tree') && !stderr.includes('does not exist')) {
        throw new Error(`git worktree remove failed: ${stderr}`);
      }
    }

    this.workspaces.delete(agentId);
    this.emit('removed', agentId);
  }

  /**
   * Prunes stale worktree references from git's internal index.
   */
  prune(): void {
    spawnSync('git', ['worktree', 'prune'], { cwd: this.repoRoot, encoding: 'utf8' });
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private sanitise(id: string): string {
    return id
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private getHeadCommit(worktreePath: string): string | undefined {
    try {
      const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: worktreePath,
        encoding: 'utf8',
      });
      return result.stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Probes the filesystem for existing worktrees under worktreeBaseDir.
   * Used when the in-memory registry has been lost (e.g. after restart).
   */
  private discoverFromFilesystem(): WorkspaceInfo[] {
    const baseDir = join(this.repoRoot, this.worktreeBaseDir);
    if (!existsSync(baseDir)) {
      return [];
    }

    const entries: WorkspaceInfo[] = [];
    try {
      for (const name of readdirSync(baseDir)) {
        const fullPath = join(baseDir, name);
        if (!statSync(fullPath).isDirectory()) continue;

        const gitDir = join(fullPath, '.git');
        if (!existsSync(gitDir)) continue;

        const info: WorkspaceInfo = {
          agentId: name,
          taskId: 'discovered',
          path: fullPath,
          branch: this.getBranch(fullPath) ?? 'unknown',
          createdAt: statSync(fullPath).birthtime,
          commitHash: this.getHeadCommit(fullPath),
        };
        entries.push(info);
        this.workspaces.set(name, info);
      }
    } catch {
      // Non-fatal — return what we have
    }

    return entries;
  }

  private getBranch(worktreePath: string): string | undefined {
    try {
      const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: worktreePath,
        encoding: 'utf8',
      });
      return result.stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }
}
