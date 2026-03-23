/**
 * @claude-flow/ide - Merge Coordinator
 *
 * Merges agent worktree branches back into the target branch after the agent
 * completes its work. Handles conflicts by emitting a notification hook and
 * defaulting to manual resolution.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { WorktreeManager } from './worktree-manager.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ConflictResolution = 'ours' | 'theirs' | 'manual';

export interface MergeResult {
  agentId: string;
  targetBranch: string;
  success: boolean;
  conflicts: string[];
  resolution?: ConflictResolution;
  mergeCommit?: string;
  error?: string;
}

export interface MergeCoordinatorOptions {
  repoRoot?: string;
  manager?: WorktreeManager;
  /** Default strategy when conflicts cannot be auto-resolved */
  defaultConflictResolution?: ConflictResolution;
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

export class MergeCoordinator extends EventEmitter {
  private readonly repoRoot: string;
  private readonly manager: WorktreeManager;
  private readonly defaultResolution: ConflictResolution;

  constructor(options: MergeCoordinatorOptions = {}) {
    super();
    this.repoRoot = options.repoRoot ?? process.cwd();
    this.manager = options.manager ?? new WorktreeManager({ repoRoot: this.repoRoot });
    this.defaultResolution = options.defaultConflictResolution ?? 'manual';
  }

  /**
   * Merges the agent's worktree branch into targetBranch using a 3-way merge.
   * On conflict, calls resolveConflict for each conflicting file.
   */
  async merge(agentId: string, targetBranch: string): Promise<MergeResult> {
    let agentBranch: string;

    try {
      const workspacePath = this.manager.getWorkspacePath(agentId);
      agentBranch = this.getBranch(workspacePath) ?? `agent/unknown/${agentId}`;
    } catch (err) {
      return {
        agentId,
        targetBranch,
        success: false,
        conflicts: [],
        error: `Workspace not found: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Switch to target branch and attempt merge
    const checkoutResult = spawnSync('git', ['checkout', targetBranch], {
      cwd: this.repoRoot,
      encoding: 'utf8',
    });

    if (checkoutResult.status !== 0) {
      return {
        agentId,
        targetBranch,
        success: false,
        conflicts: [],
        error: `Could not checkout ${targetBranch}: ${checkoutResult.stderr}`,
      };
    }

    const mergeResult = spawnSync(
      'git',
      ['merge', '--no-ff', agentBranch, '-m', `Merge agent branch ${agentBranch} into ${targetBranch}`],
      { cwd: this.repoRoot, encoding: 'utf8' },
    );

    if (mergeResult.status === 0) {
      const mergeCommit = this.getHeadCommit(this.repoRoot);
      this.emit('merged', agentId, targetBranch, mergeCommit);
      return { agentId, targetBranch, success: true, conflicts: [], mergeCommit };
    }

    // Merge failed — check for conflicts
    const conflicts = this.listConflictingFiles();

    if (conflicts.length === 0) {
      // Non-conflict failure (e.g. already merged)
      return {
        agentId,
        targetBranch,
        success: false,
        conflicts: [],
        error: mergeResult.stderr || mergeResult.stdout,
      };
    }

    // Attempt to resolve each conflict
    const resolutions: ConflictResolution[] = [];
    for (const conflictPath of conflicts) {
      const resolution = await this.resolveConflict(conflictPath);
      resolutions.push(resolution);

      if (resolution === 'ours') {
        spawnSync('git', ['checkout', '--ours', conflictPath], {
          cwd: this.repoRoot,
          encoding: 'utf8',
        });
        spawnSync('git', ['add', conflictPath], { cwd: this.repoRoot, encoding: 'utf8' });
      } else if (resolution === 'theirs') {
        spawnSync('git', ['checkout', '--theirs', conflictPath], {
          cwd: this.repoRoot,
          encoding: 'utf8',
        });
        spawnSync('git', ['add', conflictPath], { cwd: this.repoRoot, encoding: 'utf8' });
      }
      // 'manual' — leave conflict markers in place, abort
    }

    const hasManual = resolutions.some((r) => r === 'manual');
    if (hasManual) {
      // Abort the merge so the workspace is left in a clean state
      spawnSync('git', ['merge', '--abort'], { cwd: this.repoRoot, encoding: 'utf8' });
      return {
        agentId,
        targetBranch,
        success: false,
        conflicts,
        resolution: 'manual',
        error: 'Conflicts require manual resolution',
      };
    }

    // All conflicts resolved automatically — commit
    const commitResult = spawnSync(
      'git',
      ['commit', '-m', `Merge agent branch ${agentBranch} (auto-resolved conflicts)`],
      { cwd: this.repoRoot, encoding: 'utf8' },
    );

    if (commitResult.status !== 0) {
      return {
        agentId,
        targetBranch,
        success: false,
        conflicts,
        error: commitResult.stderr,
      };
    }

    const mergeCommit = this.getHeadCommit(this.repoRoot);
    const resolution = resolutions[0] ?? 'ours';
    this.emit('mergedWithResolution', agentId, targetBranch, resolution, mergeCommit);

    return { agentId, targetBranch, success: true, conflicts, resolution, mergeCommit };
  }

  /**
   * Determines how to resolve a conflict for the given file.
   *
   * Default behaviour: emit a notify hook event and return 'manual'.
   * Subclasses or event listeners can override by calling a custom strategy
   * before this returns.
   */
  async resolveConflict(conflictPath: string): Promise<ConflictResolution> {
    this.emit('conflict', conflictPath, this.defaultResolution);
    // Notify hook via CLI (fire-and-forget)
    this.fireNotifyHook(conflictPath);
    return this.defaultResolution;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private listConflictingFiles(): string[] {
    const result = spawnSync('git', ['diff', '--name-only', '--diff-filter=U'], {
      cwd: this.repoRoot,
      encoding: 'utf8',
    });
    return result.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
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

  private getHeadCommit(dir: string): string | undefined {
    try {
      const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: dir,
        encoding: 'utf8',
      });
      return result.stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  private fireNotifyHook(conflictPath: string): void {
    try {
      spawnSync(
        'npx',
        [
          'claude-flow@v3alpha',
          'hooks',
          'notify',
          '--message',
          `Merge conflict requires manual resolution: ${conflictPath}`,
        ],
        { cwd: this.repoRoot, encoding: 'utf8', timeout: 5000 },
      );
    } catch {
      // Non-fatal — hook failure should not block the merge workflow
    }
  }
}
