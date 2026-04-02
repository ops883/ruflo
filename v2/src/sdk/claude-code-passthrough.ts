/**
 * Claude Code Passthrough Adapter
 *
 * Routes LLM calls through the Claude Code SDK's query() function,
 * which uses the user's existing Claude Code subscription auth.
 * No separate ANTHROPIC_API_KEY required.
 *
 * The Claude Code SDK is loaded lazily (dynamic import) so this module
 * can be imported even when the SDK isn't installed — it only needs
 * to be present at runtime when passthrough is actually used.
 */

// Lazy-loaded SDK reference
let _query: any = null;

async function getQuery(): Promise<any> {
  if (!_query) {
    try {
      const sdk = await import('@anthropic-ai/claude-code/sdk');
      _query = sdk.query;
    } catch (err) {
      throw new Error(
        '[Passthrough] Claude Code SDK not available. ' +
        'Ensure you are running inside Claude Code, or install @anthropic-ai/claude-code. ' +
        `Original error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return _query;
}

export interface PassthroughMessage {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{ type: 'text'; text: string }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface PassthroughRequest {
  model?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  system?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
}

/**
 * Detect whether we're running inside a Claude Code environment
 * and can use the SDK's query() for auth passthrough.
 */
export function isClaudeCodeEnvironment(): boolean {
  return !!(
    process.env.CLAUDE_CODE === '1' ||
    process.env.CLAUDE_CODE_SDK === '1' ||
    process.env.CLAUDE_SESSION_ID ||
    process.env.CLAUDE_CODE_ENTRYPOINT
  );
}

/**
 * Detect whether we should use the passthrough adapter.
 * True when: no API key is available, OR explicitly opted in.
 */
export function shouldUsePassthrough(): boolean {
  // Explicit opt-in always wins
  if (process.env.RUFLO_USE_CLAUDE_CODE_AUTH === '1') {
    return true;
  }

  // If an API key is set, prefer direct API (faster, no CLI overhead)
  const hasApiKey = !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.CLAUDE_API_KEY
  );

  if (hasApiKey) {
    return false;
  }

  // No API key — use Claude Code passthrough
  return true;
}

/**
 * Claude Code Passthrough Adapter
 *
 * Implements the same message-creation interface as ClaudeFlowSDKAdapter
 * but routes through Claude Code's query() function, which inherits
 * the user's subscription authentication.
 */
export class ClaudeCodePassthroughAdapter {
  private swarmMetadata: Map<string, Record<string, unknown>> = new Map();
  private swarmMode: boolean;

  constructor(options: { swarmMode?: boolean } = {}) {
    this.swarmMode = options.swarmMode !== false;
  }

  /**
   * Create a message by routing through Claude Code SDK query().
   */
  async createMessage(params: PassthroughRequest): Promise<PassthroughMessage> {
    const queryFn = await getQuery();
    const prompt = this.buildQueryPrompt(params);
    const startTime = Date.now();

    const queryInstance = queryFn({
      prompt,
      options: {
        maxTurns: 1,
        systemPrompt: params.system || undefined,
        allowedTools: [],
      },
    });

    let resultText = '';
    let model = params.model || 'claude-sonnet-4-20250514';

    for await (const message of queryInstance) {
      if (message.type === 'assistant') {
        if (typeof message.message === 'string') {
          resultText += message.message;
        } else if (Array.isArray(message.message)) {
          for (const block of message.message) {
            if (block.type === 'text') {
              resultText += block.text;
            }
          }
        }
      } else if (message.type === 'result') {
        if (message.result && typeof message.result === 'string') {
          resultText = message.result;
        } else if (message.result?.text) {
          resultText = message.result.text;
        }
        if (message.model) {
          model = message.model;
        }
      }
    }

    const executionTime = Date.now() - startTime;
    const estimatedInputTokens = Math.ceil(prompt.length / 4);
    const estimatedOutputTokens = Math.ceil(resultText.length / 4);

    const response: PassthroughMessage = {
      id: `msg_passthrough_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: resultText }],
      model,
      stop_reason: 'end_turn',
      usage: {
        input_tokens: estimatedInputTokens,
        output_tokens: estimatedOutputTokens,
      },
    };

    if (this.swarmMode && response.id) {
      this.swarmMetadata.set(response.id, {
        timestamp: Date.now(),
        model,
        tokensUsed: response.usage,
        executionTime,
        passthrough: true,
      });
    }

    return response;
  }

  /**
   * Create a streaming message via passthrough.
   */
  async createStreamingMessage(
    params: PassthroughRequest,
    options?: { onChunk?: (chunk: any) => void }
  ): Promise<PassthroughMessage> {
    const queryFn = await getQuery();
    const prompt = this.buildQueryPrompt(params);

    const queryInstance = queryFn({
      prompt,
      options: {
        maxTurns: 1,
        systemPrompt: params.system || undefined,
        allowedTools: [],
      },
    });

    let resultText = '';
    let model = params.model || 'claude-sonnet-4-20250514';

    for await (const message of queryInstance) {
      if (message.type === 'assistant') {
        let chunkText = '';
        if (typeof message.message === 'string') {
          chunkText = message.message;
        } else if (Array.isArray(message.message)) {
          for (const block of message.message) {
            if (block.type === 'text') {
              chunkText += block.text;
            }
          }
        }

        resultText += chunkText;

        if (options?.onChunk && chunkText) {
          options.onChunk({
            type: 'content_block_delta',
            delta: { text: chunkText },
          });
        }
      } else if (message.type === 'result') {
        if (message.result && typeof message.result === 'string') {
          resultText = message.result;
        }
        if (message.model) {
          model = message.model;
        }
      }
    }

    const estimatedInputTokens = Math.ceil(prompt.length / 4);
    const estimatedOutputTokens = Math.ceil(resultText.length / 4);

    return {
      id: `msg_passthrough_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: resultText }],
      model,
      stop_reason: 'end_turn',
      usage: {
        input_tokens: estimatedInputTokens,
        output_tokens: estimatedOutputTokens,
      },
    };
  }

  /**
   * Build a query prompt from the request parameters.
   */
  private buildQueryPrompt(params: PassthroughRequest): string {
    const parts: string[] = [];

    for (const msg of params.messages) {
      if (msg.role === 'user') {
        parts.push(msg.content);
      } else if (msg.role === 'assistant') {
        parts.push(`[Previous assistant response]: ${msg.content}`);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Validate that Claude Code SDK is accessible.
   */
  async validateConfiguration(): Promise<boolean> {
    try {
      const queryFn = await getQuery();

      const testQuery = queryFn({
        prompt: 'Reply with just the word "ok".',
        options: {
          maxTurns: 1,
          allowedTools: [],
        },
      });

      for await (const message of testQuery) {
        if (message.type === 'result') {
          return true;
        }
      }

      return true;
    } catch (error) {
      console.error('[Passthrough] Claude Code SDK validation failed:', error);
      return false;
    }
  }

  getSwarmMetadata(messageId: string): Record<string, unknown> | undefined {
    return this.swarmMetadata.get(messageId);
  }

  clearSwarmMetadata(): void {
    this.swarmMetadata.clear();
  }

  getUsageStats(): { totalTokens: number; messageCount: number } {
    let totalTokens = 0;
    let messageCount = 0;

    this.swarmMetadata.forEach((metadata) => {
      if (metadata.tokensUsed) {
        const usage = metadata.tokensUsed as { input_tokens: number; output_tokens: number };
        totalTokens += (usage.input_tokens || 0) + (usage.output_tokens || 0);
        messageCount++;
      }
    });

    return { totalTokens, messageCount };
  }
}
