/**
 * Claude Agent SDK Configuration Adapter
 * Claude-Flow v2.5-alpha.130
 *
 * This module provides the configuration adapter for integrating
 * the Anthropic SDK as the foundation layer for Claude-Flow.
 *
 * When no ANTHROPIC_API_KEY is available, automatically falls back
 * to the Claude Code SDK passthrough adapter, which uses the user's
 * existing Claude Code subscription for authentication.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  ClaudeCodePassthroughAdapter,
  shouldUsePassthrough,
  type PassthroughMessage,
  type PassthroughRequest,
} from './claude-code-passthrough.js';

export interface SDKConfiguration {
  apiKey?: string;
  baseURL?: string;
  maxRetries?: number;
  timeout?: number;
  defaultHeaders?: Record<string, string>;

  // Claude-Flow specific extensions
  swarmMode?: boolean;
  persistenceEnabled?: boolean;
  checkpointInterval?: number;
  memoryNamespace?: string;
}

/**
 * Claude-Flow SDK Adapter
 * Wraps the Anthropic SDK with Claude-Flow extensions.
 *
 * Automatically detects whether to use direct Anthropic API (with key)
 * or Claude Code passthrough (subscription auth, no key needed).
 */
export class ClaudeFlowSDKAdapter {
  private sdk: Anthropic | null = null;
  private passthrough: ClaudeCodePassthroughAdapter | null = null;
  private config: SDKConfiguration;
  private swarmMetadata: Map<string, Record<string, unknown>> = new Map();
  private usingPassthrough: boolean;

  constructor(config: SDKConfiguration = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
      baseURL: config.baseURL,
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 60000,
      defaultHeaders: config.defaultHeaders || {},
      swarmMode: config.swarmMode !== false,
      persistenceEnabled: config.persistenceEnabled !== false,
      checkpointInterval: config.checkpointInterval || 60000,
      memoryNamespace: config.memoryNamespace || 'claude-flow'
    };

    // Decide which execution path to use
    this.usingPassthrough = shouldUsePassthrough();

    if (this.usingPassthrough) {
      // No API key — route through Claude Code subscription
      console.log('[SDK] No ANTHROPIC_API_KEY detected. Using Claude Code subscription passthrough.');
      this.passthrough = new ClaudeCodePassthroughAdapter({
        swarmMode: this.config.swarmMode,
      });
    } else {
      // Standard path — direct Anthropic SDK with API key
      this.sdk = new Anthropic({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
        maxRetries: this.config.maxRetries,
        timeout: this.config.timeout,
        defaultHeaders: this.config.defaultHeaders
      });
    }
  }

  /**
   * Whether this adapter is using Claude Code passthrough (no API key)
   */
  isUsingPassthrough(): boolean {
    return this.usingPassthrough;
  }

  /**
   * Get the underlying Anthropic SDK instance.
   * Returns null if using passthrough mode.
   */
  getSDK(): Anthropic {
    if (this.usingPassthrough) {
      // Return a dummy Anthropic instance for type compatibility.
      // Callers should use createMessage() instead of accessing the SDK directly.
      console.warn(
        '[SDK] getSDK() called in passthrough mode. Use createMessage() for LLM calls.'
      );
      // Create a minimal instance — it won't be used for actual API calls
      return new Anthropic({ apiKey: 'passthrough-mode-no-key-needed' });
    }
    return this.sdk!;
  }

  /**
   * Get the current configuration
   */
  getConfig(): SDKConfiguration {
    return { ...this.config };
  }

  /**
   * Create a message with automatic retry handling.
   * Routes through passthrough if no API key is available.
   */
  async createMessage(params: Anthropic.MessageCreateParams): Promise<Anthropic.Message> {
    if (this.usingPassthrough && this.passthrough) {
      return this.createMessageViaPassthrough(params);
    }

    return this.createMessageViaDirect(params);
  }

  /**
   * Direct Anthropic SDK path (original behaviour)
   */
  private async createMessageViaDirect(params: Anthropic.MessageCreateParams): Promise<Anthropic.Message> {
    try {
      const message = await this.sdk!.messages.create(params) as Anthropic.Message;

      if (this.config.swarmMode && message.id) {
        this.swarmMetadata.set(message.id, {
          timestamp: Date.now(),
          model: params.model,
          tokensUsed: message.usage
        });
      }

      return message;
    } catch (error) {
      if (this.config.swarmMode) {
        console.error('[SDK] Message creation failed in swarm mode:', error);
        this.logSwarmError(error);
      }
      throw error;
    }
  }

  /**
   * Claude Code passthrough path (subscription auth)
   */
  private async createMessageViaPassthrough(params: Anthropic.MessageCreateParams): Promise<Anthropic.Message> {
    try {
      // Convert Anthropic SDK params to passthrough format
      const passthroughRequest: PassthroughRequest = {
        model: params.model as string,
        messages: (params.messages as Array<{ role: 'user' | 'assistant'; content: string }>).map(m => ({
          role: m.role as 'user' | 'assistant',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        })),
        system: typeof params.system === 'string' ? params.system : undefined,
        max_tokens: params.max_tokens,
        temperature: params.temperature ?? undefined,
        top_p: params.top_p ?? undefined,
        top_k: params.top_k ?? undefined,
        stop_sequences: params.stop_sequences ?? undefined,
      };

      const response = await this.passthrough!.createMessage(passthroughRequest);

      // Convert to Anthropic.Message shape for compatibility
      const message = response as unknown as Anthropic.Message;

      if (this.config.swarmMode && message.id) {
        this.swarmMetadata.set(message.id, {
          timestamp: Date.now(),
          model: params.model,
          tokensUsed: message.usage,
          passthrough: true,
        });
      }

      return message;
    } catch (error) {
      if (this.config.swarmMode) {
        console.error('[SDK] Passthrough message creation failed in swarm mode:', error);
        this.logSwarmError(error);
      }
      throw error;
    }
  }

  /**
   * Create a streaming message
   */
  async createStreamingMessage(
    params: Anthropic.MessageCreateParams,
    options?: { onChunk?: (chunk: any) => void }
  ): Promise<Anthropic.Message> {
    if (this.usingPassthrough && this.passthrough) {
      const passthroughRequest: PassthroughRequest = {
        model: params.model as string,
        messages: (params.messages as Array<{ role: 'user' | 'assistant'; content: string }>).map(m => ({
          role: m.role as 'user' | 'assistant',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        })),
        system: typeof params.system === 'string' ? params.system : undefined,
        max_tokens: params.max_tokens,
        temperature: params.temperature ?? undefined,
        stream: true,
      };

      const response = await this.passthrough.createStreamingMessage(
        passthroughRequest,
        options
      );

      return response as unknown as Anthropic.Message;
    }

    // Direct SDK streaming path
    const stream = await this.sdk!.messages.create({
      ...params,
      stream: true
    });

    let fullMessage: Partial<Anthropic.Message> = {};

    for await (const chunk of stream) {
      if (options?.onChunk) {
        options.onChunk(chunk);
      }

      if (chunk.type === 'message_start') {
        fullMessage = chunk.message;
      } else if (chunk.type === 'content_block_delta') {
        // Handle content updates
      } else if (chunk.type === 'message_delta') {
        if (chunk.delta?.stop_reason) {
          fullMessage.stop_reason = chunk.delta.stop_reason;
        }
      }
    }

    return fullMessage as Anthropic.Message;
  }

  /**
   * Check if the SDK is properly configured
   */
  async validateConfiguration(): Promise<boolean> {
    if (this.usingPassthrough && this.passthrough) {
      return this.passthrough.validateConfiguration();
    }

    try {
      await this.sdk!.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }]
      });
      return true;
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        console.error('[SDK] Invalid API key');
        return false;
      }
      if (error instanceof Anthropic.RateLimitError) {
        console.warn('[SDK] Rate limit reached but configuration is valid');
        return true;
      }
      console.error('[SDK] Configuration validation failed:', error);
      return false;
    }
  }

  /**
   * Get swarm metadata for a message
   */
  getSwarmMetadata(messageId: string): Record<string, unknown> | undefined {
    return this.swarmMetadata.get(messageId);
  }

  /**
   * Clear swarm metadata
   */
  clearSwarmMetadata(): void {
    this.swarmMetadata.clear();
  }

  /**
   * Log error to swarm coordination system
   */
  private logSwarmError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    this.swarmMetadata.set(`error-${Date.now()}`, {
      timestamp: Date.now(),
      error: errorMessage,
      stack: errorStack
    });
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): { totalTokens: number; messageCount: number } {
    let totalTokens = 0;
    let messageCount = 0;

    this.swarmMetadata.forEach((metadata) => {
      if (metadata.tokensUsed) {
        totalTokens += (metadata.tokensUsed as any).total_tokens || 0;
        messageCount++;
      }
    });

    return { totalTokens, messageCount };
  }
}

// Export a singleton instance for convenience
export const defaultSDKAdapter = new ClaudeFlowSDKAdapter();
