/**
 * @claude-flow/ide - Antigravity Guidance Overlay
 *
 * Reads Ruflo governance rules from the constitution or CLAUDE.md and pushes
 * them as a system-prompt prefix into Antigravity agent configs. This ensures
 * every Antigravity agent respects the same behavioural guardrails as Ruflo
 * agents.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { EventEmitter } from 'node:events';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ConstitutionRule {
  id: string;
  text: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  category?: string;
}

export interface Constitution {
  version?: string;
  rules: ConstitutionRule[];
  metadata?: Record<string, unknown>;
}

export interface GuidanceOverlayOptions {
  /** Path to .claude-flow/constitution.json relative to workspace root */
  constitutionRelativePath?: string;
  /** Fallback file — CLAUDE.md sections parsed for rules */
  claudeMdRelativePath?: string;
  /** Maximum number of rules to include in the system-prompt prefix */
  maxRules?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

export class GuidanceOverlay extends EventEmitter {
  private readonly options: Required<GuidanceOverlayOptions>;
  private cachedPrefix: string | null = null;
  private cacheWorkspaceRoot: string | null = null;

  constructor(options: GuidanceOverlayOptions = {}) {
    super();
    this.options = {
      constitutionRelativePath:
        options.constitutionRelativePath ?? '.claude-flow/constitution.json',
      claudeMdRelativePath: options.claudeMdRelativePath ?? 'CLAUDE.md',
      maxRules: options.maxRules ?? 30,
    };
  }

  /**
   * Loads governance rules from the workspace and returns them formatted as a
   * string suitable for use as a system-prompt prefix.
   *
   * Loading priority:
   *   1. .claude-flow/constitution.json (structured JSON)
   *   2. CLAUDE.md (parsed heuristically)
   *   3. Built-in minimal fallback rules
   */
  getSystemPromptPrefix(workspaceRoot = process.cwd()): string {
    if (this.cachedPrefix && this.cacheWorkspaceRoot === workspaceRoot) {
      return this.cachedPrefix;
    }

    const rules = this.loadRules(workspaceRoot);
    const prefix = this.formatRules(rules);
    this.cachedPrefix = prefix;
    this.cacheWorkspaceRoot = workspaceRoot;

    return prefix;
  }

  /**
   * Writes the governance rules to .antigravity/system-prompt-prefix.md.
   * Creates the directory if needed. Invalidates the cache after writing so
   * the next call to getSystemPromptPrefix re-reads from disk.
   */
  async applyToAntigravityConfig(configPath: string): Promise<void> {
    const dir = dirname(configPath);
    const workspaceRoot = dirname(dir); // configPath is .antigravity/system-prompt-prefix.md

    const prefix = this.getSystemPromptPrefix(workspaceRoot);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(configPath, prefix + '\n', 'utf8');
    this.emit('applied', configPath);

    // Invalidate cache so fresh reads pick up any on-disk changes
    this.cachedPrefix = null;
    this.cacheWorkspaceRoot = null;
  }

  /**
   * Forces cache invalidation so the next call loads from disk.
   */
  invalidateCache(): void {
    this.cachedPrefix = null;
    this.cacheWorkspaceRoot = null;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private loadRules(workspaceRoot: string): ConstitutionRule[] {
    // 1. Try constitution.json
    const constitutionPath = join(workspaceRoot, this.options.constitutionRelativePath);
    if (existsSync(constitutionPath)) {
      try {
        const raw = readFileSync(constitutionPath, 'utf8');
        const constitution = JSON.parse(raw) as Constitution;
        if (Array.isArray(constitution.rules) && constitution.rules.length > 0) {
          return constitution.rules.slice(0, this.options.maxRules);
        }
      } catch {
        this.emit('warning', `Failed to parse ${constitutionPath}`);
      }
    }

    // 2. Try CLAUDE.md
    const claudeMdPath = join(workspaceRoot, this.options.claudeMdRelativePath);
    if (existsSync(claudeMdPath)) {
      try {
        const md = readFileSync(claudeMdPath, 'utf8');
        return this.parseMarkdownRules(md).slice(0, this.options.maxRules);
      } catch {
        this.emit('warning', `Failed to read ${claudeMdPath}`);
      }
    }

    // 3. Built-in fallback
    return this.builtinRules();
  }

  /**
   * Extracts rules from CLAUDE.md by looking for:
   * - Lines under a "Behavioral Rules" heading
   * - Bullet / numbered list items in any "Rules" or "Principles" section
   */
  private parseMarkdownRules(md: string): ConstitutionRule[] {
    const rules: ConstitutionRule[] = [];
    const lines = md.split('\n');

    let inRulesSection = false;
    let ruleIndex = 0;

    for (const line of lines) {
      // Detect section headings that indicate rules content
      if (/^#{1,3}\s.*(rule|behavior|principle|guideline|must|never|always)/i.test(line)) {
        inRulesSection = true;
        continue;
      }

      // Leaving a rules section when we hit another top-level heading
      if (/^#{1,2}\s/.test(line) && inRulesSection) {
        inRulesSection = false;
      }

      // Capture bullet / numbered list items
      const bulletMatch = line.match(/^[-*]\s+(.+)/) ?? line.match(/^\d+\.\s+(.+)/);
      if (bulletMatch?.[1] && (inRulesSection || this.looksLikeRule(bulletMatch[1]))) {
        ruleIndex++;
        rules.push({
          id: `md-rule-${ruleIndex}`,
          text: bulletMatch[1].trim(),
        });
      }
    }

    return rules;
  }

  /** Returns true for bullet text that reads like a behavioural constraint. */
  private looksLikeRule(text: string): boolean {
    return /\b(never|always|must|should|do not|don't|avoid|prefer|require)\b/i.test(text);
  }

  private builtinRules(): ConstitutionRule[] {
    return [
      { id: 'builtin-1', text: 'Do what has been asked; nothing more, nothing less.', priority: 'critical' },
      { id: 'builtin-2', text: 'NEVER create files unless they are absolutely necessary.', priority: 'critical' },
      { id: 'builtin-3', text: 'ALWAYS prefer editing an existing file to creating a new one.', priority: 'high' },
      { id: 'builtin-4', text: 'NEVER commit secrets, credentials, or .env files.', priority: 'critical' },
      { id: 'builtin-5', text: 'NEVER save working files or tests to the root folder.', priority: 'high' },
    ];
  }

  private formatRules(rules: ConstitutionRule[]): string {
    if (rules.length === 0) {
      return '';
    }

    const header = '# Ruflo Governance Rules (system prompt prefix)\n';
    const body = rules
      .map((r, i) => {
        const priority = r.priority ? ` [${r.priority.toUpperCase()}]` : '';
        return `${i + 1}. ${r.text}${priority}`;
      })
      .join('\n');

    return `${header}\n${body}`;
  }
}
