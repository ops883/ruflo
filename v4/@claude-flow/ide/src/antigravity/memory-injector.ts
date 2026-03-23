/**
 * @claude-flow/ide - Antigravity Memory Injector
 *
 * Injects Ruflo ReasoningBank context into Antigravity agent prompts before
 * they execute. Queries the Ruflo CLI memory search and formats results as a
 * structured prefix that the agent can leverage.
 */

import { spawn } from 'node:child_process';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MemorySearchResult {
  key: string;
  content: string;
  relevanceScore?: number;
  namespace?: string;
  tags?: string[];
}

export interface MemoryInjectorOptions {
  /** Maximum number of ReasoningBank results to retrieve per query */
  maxResults?: number;
  /** Namespace to search within */
  namespace?: string;
  /** Minimum relevance threshold (0-1) */
  relevanceThreshold?: number;
  /** Prefix header inserted before the injected context block */
  contextHeader?: string;
  /** Suffix footer inserted after the injected context block */
  contextFooter?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

export class MemoryInjector {
  private readonly options: Required<MemoryInjectorOptions>;

  constructor(options: MemoryInjectorOptions = {}) {
    this.options = {
      maxResults: options.maxResults ?? 5,
      namespace: options.namespace ?? '',
      relevanceThreshold: options.relevanceThreshold ?? 0.5,
      contextHeader:
        options.contextHeader ??
        '--- Ruflo ReasoningBank Context (injected) ---',
      contextFooter:
        options.contextFooter ?? '--- End of ReasoningBank Context ---',
    };
  }

  /**
   * Queries the Ruflo ReasoningBank for memories relevant to the given task
   * and returns them as a formatted, human-readable string.
   */
  async getContextForTask(taskDescription: string): Promise<string> {
    const raw = await this.searchMemory(taskDescription);
    if (!raw.trim()) {
      return '';
    }

    const parsed = this.parseCliOutput(raw);
    if (parsed.length === 0) {
      return '';
    }

    const filtered = parsed.filter(
      (r) => r.relevanceScore == null || r.relevanceScore >= this.options.relevanceThreshold,
    );

    if (filtered.length === 0) {
      return '';
    }

    const lines = filtered.map((r, i) => {
      const score =
        r.relevanceScore != null ? ` [score: ${r.relevanceScore.toFixed(2)}]` : '';
      const ns = r.namespace ? ` (${r.namespace})` : '';
      return `[${i + 1}]${ns}${score}\n${r.content}`;
    });

    return [this.options.contextHeader, ...lines, this.options.contextFooter].join('\n\n');
  }

  /**
   * Prepends relevant ReasoningBank context to the given agent prompt.
   * When no context is found the original prompt is returned unchanged.
   */
  async injectIntoAgentPrompt(prompt: string, task: string): Promise<string> {
    const context = await this.getContextForTask(task);
    if (!context) {
      return prompt;
    }
    return `${context}\n\n${prompt}`;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Calls the Ruflo CLI memory search sub-command and returns raw stdout.
   */
  private searchMemory(query: string): Promise<string> {
    return new Promise((resolve) => {
      const args: string[] = [
        'claude-flow@v3alpha',
        'memory',
        'search',
        '--query',
        query,
        '--limit',
        String(this.options.maxResults),
      ];

      if (this.options.namespace) {
        args.push('--namespace', this.options.namespace);
      }

      let stdout = '';
      let stderr = '';

      const child = spawn('npx', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      });

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('close', () => {
        resolve(stdout || stderr);
      });

      child.on('error', (err) => {
        resolve(`Memory search error: ${err.message}`);
      });
    });
  }

  /**
   * Parses CLI output into structured MemorySearchResult objects.
   *
   * The Ruflo CLI outputs results in a structured format. We try to parse JSON
   * first (when --output-format json is used), then fall back to line-by-line
   * heuristic parsing.
   */
  private parseCliOutput(raw: string): MemorySearchResult[] {
    // Attempt JSON parse
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => ({
          key: String(item.key ?? item.id ?? ''),
          content: String(item.content ?? item.value ?? item.text ?? ''),
          relevanceScore:
            typeof item.score === 'number' ? item.score : undefined,
          namespace: item.namespace != null ? String(item.namespace) : undefined,
          tags: Array.isArray(item.tags) ? (item.tags as string[]) : undefined,
        }));
      }
      if (parsed && typeof parsed === 'object' && 'results' in parsed) {
        return this.parseCliOutput(JSON.stringify((parsed as { results: unknown }).results));
      }
    } catch {
      // fall through to text parsing
    }

    // Heuristic line-based parsing for plain-text CLI output
    const results: MemorySearchResult[] = [];
    const blocks = raw.split(/\n(?=\[|\d+\.)/).filter((b) => b.trim());

    for (const block of blocks) {
      const lines = block.split('\n').filter((l) => l.trim());
      if (lines.length === 0) continue;

      const result: MemorySearchResult = {
        key: '',
        content: lines.join('\n').trim(),
      };

      // Try to extract a score like "score: 0.87" or "relevance: 87%"
      const scoreMatch = block.match(/(?:score|relevance)[:\s]+([0-9.]+)/i);
      if (scoreMatch?.[1]) {
        const raw = parseFloat(scoreMatch[1]);
        result.relevanceScore = raw > 1 ? raw / 100 : raw;
      }

      // Try to extract a key like "key: something"
      const keyMatch = block.match(/(?:key|id)[:\s]+(\S+)/i);
      if (keyMatch?.[1]) {
        result.key = keyMatch[1];
      }

      if (result.content) {
        results.push(result);
      }
    }

    return results;
  }
}
