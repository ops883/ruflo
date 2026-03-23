/**
 * @claude-flow/ide - Cursor Rules Generator
 *
 * Auto-generates .cursorrules from the Ruflo governance constitution or
 * CLAUDE.md. Cursor reads .cursorrules as project-level AI instructions
 * so keeping it in sync with the Ruflo constitution ensures all Cursor AI
 * interactions follow the same governance constraints.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GovernanceRule {
  id?: string;
  text: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  category?: string;
}

export interface GovernanceConstitution {
  version?: string;
  rules: GovernanceRule[];
}

export interface CursorRulesGeneratorOptions {
  /** Max rules to include (Cursor .cursorrules is read fully each turn) */
  maxRules?: number;
  /** Include rule numbers in output */
  numbered?: boolean;
  /** Path to constitution.json relative to workspace root */
  constitutionRelativePath?: string;
  /** Fallback path relative to workspace root */
  claudeMdRelativePath?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

export class CursorRulesGenerator extends EventEmitter {
  private readonly options: Required<CursorRulesGeneratorOptions>;

  constructor(options: CursorRulesGeneratorOptions = {}) {
    super();
    this.options = {
      maxRules: options.maxRules ?? 100,
      numbered: options.numbered ?? true,
      constitutionRelativePath:
        options.constitutionRelativePath ?? '.claude-flow/constitution.json',
      claudeMdRelativePath: options.claudeMdRelativePath ?? 'CLAUDE.md',
    };
  }

  /**
   * Loads governance rules and formats them as a Cursor-compatible
   * .cursorrules string. Returns the formatted string.
   */
  generate(workspaceRoot = process.cwd()): string {
    const rules = this.loadRules(workspaceRoot);
    return this.format(rules);
  }

  /**
   * Generates and writes .cursorrules to the workspace root.
   */
  async write(workspaceRoot = process.cwd()): Promise<void> {
    const content = this.generate(workspaceRoot);
    const outputPath = join(workspaceRoot, '.cursorrules');
    writeFileSync(outputPath, content + '\n', 'utf8');
    this.emit('written', outputPath, content);
  }

  /**
   * Returns the path where .cursorrules would be written.
   */
  getOutputPath(workspaceRoot: string): string {
    return join(workspaceRoot, '.cursorrules');
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private loadRules(workspaceRoot: string): GovernanceRule[] {
    // 1. Try constitution.json
    const constitutionPath = join(workspaceRoot, this.options.constitutionRelativePath);
    if (existsSync(constitutionPath)) {
      try {
        const raw = readFileSync(constitutionPath, 'utf8');
        const constitution = JSON.parse(raw) as GovernanceConstitution;
        if (Array.isArray(constitution.rules) && constitution.rules.length > 0) {
          return this.sortByPriority(constitution.rules).slice(0, this.options.maxRules);
        }
      } catch {
        this.emit('warning', `Could not parse ${constitutionPath}`);
      }
    }

    // 2. Try CLAUDE.md
    const claudeMdPath = join(workspaceRoot, this.options.claudeMdRelativePath);
    if (existsSync(claudeMdPath)) {
      try {
        const md = readFileSync(claudeMdPath, 'utf8');
        const rules = this.extractFromMarkdown(md);
        if (rules.length > 0) {
          return rules.slice(0, this.options.maxRules);
        }
      } catch {
        this.emit('warning', `Could not read ${claudeMdPath}`);
      }
    }

    // 3. Built-in minimal rules
    return this.fallbackRules();
  }

  /**
   * Formats rules as numbered Cursor rule blocks.
   * Each rule is prefixed with `# Rule:` as required by the spec.
   */
  private format(rules: GovernanceRule[]): string {
    if (rules.length === 0) {
      return '# No governance rules found.';
    }

    const header = [
      '# Ruflo Governance Rules',
      '# Auto-generated — do not edit by hand. Run `ruflo ide cursor init` to regenerate.',
      '',
    ].join('\n');

    const body = rules
      .map((rule, index) => {
        const num = this.options.numbered ? `${index + 1}. ` : '';
        const priorityTag = rule.priority ? ` [${rule.priority.toUpperCase()}]` : '';
        const categoryTag = rule.category ? ` [${rule.category}]` : '';
        return `# Rule:${priorityTag}${categoryTag}\n${num}${rule.text}`;
      })
      .join('\n\n');

    return `${header}\n${body}`;
  }

  /**
   * Parses CLAUDE.md to extract behavioural rules from list items under
   * relevant headings.
   */
  private extractFromMarkdown(md: string): GovernanceRule[] {
    const rules: GovernanceRule[] = [];
    const lines = md.split('\n');

    let inRulesSection = false;
    let ruleIndex = 0;

    for (const line of lines) {
      if (/^#{1,3}\s.*(rule|behavior|behaviour|principle|guideline|always|never|must)/i.test(line)) {
        inRulesSection = true;
        continue;
      }

      if (/^#{1,2}\s/.test(line) && inRulesSection) {
        inRulesSection = false;
      }

      const bulletMatch =
        line.match(/^[-*]\s+(.+)/) ??
        line.match(/^\d+\.\s+(.+)/);

      if (bulletMatch?.[1]) {
        const text = bulletMatch[1].trim();
        const isConstraint = /\b(never|always|must|should|do not|don't|avoid|prefer|require)\b/i.test(text);

        if (inRulesSection || isConstraint) {
          ruleIndex++;
          rules.push({
            id: `md-${ruleIndex}`,
            text,
            priority: this.inferPriority(text),
          });
        }
      }
    }

    return rules;
  }

  private inferPriority(text: string): GovernanceRule['priority'] {
    if (/\bnever\b/i.test(text) || /\bcritical\b/i.test(text)) return 'critical';
    if (/\bmust\b/i.test(text) || /\balways\b/i.test(text)) return 'high';
    if (/\bshould\b/i.test(text) || /\bprefer\b/i.test(text)) return 'medium';
    return 'low';
  }

  private sortByPriority(rules: GovernanceRule[]): GovernanceRule[] {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...rules].sort((a, b) => {
      const pa = order[a.priority ?? 'low'] ?? 3;
      const pb = order[b.priority ?? 'low'] ?? 3;
      return pa - pb;
    });
  }

  private fallbackRules(): GovernanceRule[] {
    return [
      { id: 'fb-1', text: 'Do what has been asked; nothing more, nothing less.', priority: 'critical' },
      { id: 'fb-2', text: 'NEVER create files unless they are absolutely necessary.', priority: 'critical' },
      { id: 'fb-3', text: 'ALWAYS prefer editing an existing file to creating a new one.', priority: 'high' },
      { id: 'fb-4', text: 'NEVER commit secrets, credentials, or .env files.', priority: 'critical' },
      { id: 'fb-5', text: 'NEVER save working files or tests to the root folder.', priority: 'high' },
      { id: 'fb-6', text: 'Keep files under 400 lines; split when larger.', priority: 'medium' },
      { id: 'fb-7', text: 'Use typed interfaces for all public APIs.', priority: 'medium' },
      { id: 'fb-8', text: 'Validate all inputs at system boundaries.', priority: 'high' },
    ];
  }
}
