/**
 * Budget Manager
 * Tracks token usage per agent and per swarm session with configurable limits.
 */

import { EventEmitter } from 'node:events';
import type { TokenUsage } from './types.js';

export interface BudgetConfig {
  /** Maximum tokens allowed per individual agent */
  maxTokensPerAgent?: number;
  /** Maximum tokens allowed across the entire session */
  maxTokensPerSession?: number;
  /** Maximum USD budget for the session */
  maxBudgetUSD?: number;
}

export interface AgentBudgetStatus {
  agentId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  /** Percentage of per-agent limit used (0-100), undefined if no limit */
  percentUsed?: number;
}

export interface BudgetStatus {
  session: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    percentTokensUsed?: number;
    percentBudgetUsed?: number;
  };
  agents: Map<string, AgentBudgetStatus>;
  limits: BudgetConfig;
}

interface AgentAccumulator {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

const WARNING_THRESHOLD = 0.8;
const LIMIT_THRESHOLD = 1.0;

export class BudgetManager extends EventEmitter {
  private readonly config: BudgetConfig;
  private readonly agents: Map<string, AgentAccumulator> = new Map();
  private sessionInputTokens = 0;
  private sessionOutputTokens = 0;
  private sessionTotalTokens = 0;
  private sessionCostUsd = 0;

  constructor(config: BudgetConfig = {}) {
    super();
    this.config = { ...config };
  }

  /** Record token usage from a task result for a given agent. */
  recordUsage(agentId: string, tokenUsage: TokenUsage): void {
    let agent = this.agents.get(agentId);
    if (!agent) {
      agent = { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };
      this.agents.set(agentId, agent);
    }

    agent.inputTokens += tokenUsage.inputTokens;
    agent.outputTokens += tokenUsage.outputTokens;
    agent.totalTokens += tokenUsage.totalTokens;
    agent.costUsd += tokenUsage.costUsd ?? 0;

    this.sessionInputTokens += tokenUsage.inputTokens;
    this.sessionOutputTokens += tokenUsage.outputTokens;
    this.sessionTotalTokens += tokenUsage.totalTokens;
    this.sessionCostUsd += tokenUsage.costUsd ?? 0;

    this.checkThresholds(agentId, agent);
  }

  /** Check whether an agent is allowed to continue executing tasks. */
  checkBudget(agentId: string): { allowed: boolean; reason?: string } {
    const agent = this.agents.get(agentId);

    if (agent && this.config.maxTokensPerAgent) {
      if (agent.totalTokens >= this.config.maxTokensPerAgent) {
        return {
          allowed: false,
          reason: `Agent ${agentId} exceeded per-agent token limit (${agent.totalTokens}/${this.config.maxTokensPerAgent})`,
        };
      }
    }

    if (this.config.maxTokensPerSession) {
      if (this.sessionTotalTokens >= this.config.maxTokensPerSession) {
        return {
          allowed: false,
          reason: `Session token limit exceeded (${this.sessionTotalTokens}/${this.config.maxTokensPerSession})`,
        };
      }
    }

    if (this.config.maxBudgetUSD) {
      if (this.sessionCostUsd >= this.config.maxBudgetUSD) {
        return {
          allowed: false,
          reason: `Session USD budget exceeded ($${this.sessionCostUsd.toFixed(4)}/$${this.config.maxBudgetUSD})`,
        };
      }
    }

    return { allowed: true };
  }

  /** Get usage for a specific agent, or all agents if no ID provided. */
  getUsage(agentId?: string): AgentBudgetStatus | AgentBudgetStatus[] {
    if (agentId) {
      return this.buildAgentStatus(agentId);
    }
    return Array.from(this.agents.keys()).map((id) => this.buildAgentStatus(id));
  }

  /** Get aggregated session-level usage. */
  getSessionUsage(): BudgetStatus['session'] {
    return {
      totalTokens: this.sessionTotalTokens,
      inputTokens: this.sessionInputTokens,
      outputTokens: this.sessionOutputTokens,
      costUsd: this.sessionCostUsd,
      percentTokensUsed: this.config.maxTokensPerSession
        ? (this.sessionTotalTokens / this.config.maxTokensPerSession) * 100
        : undefined,
      percentBudgetUsed: this.config.maxBudgetUSD
        ? (this.sessionCostUsd / this.config.maxBudgetUSD) * 100
        : undefined,
    };
  }

  /** Reset all tracked usage. */
  reset(): void {
    this.agents.clear();
    this.sessionInputTokens = 0;
    this.sessionOutputTokens = 0;
    this.sessionTotalTokens = 0;
    this.sessionCostUsd = 0;
  }

  private buildAgentStatus(agentId: string): AgentBudgetStatus {
    const a = this.agents.get(agentId);
    const limit = this.config.maxTokensPerAgent;
    return {
      agentId,
      inputTokens: a?.inputTokens ?? 0,
      outputTokens: a?.outputTokens ?? 0,
      totalTokens: a?.totalTokens ?? 0,
      costUsd: a?.costUsd ?? 0,
      percentUsed: limit ? ((a?.totalTokens ?? 0) / limit) * 100 : undefined,
    };
  }

  private checkThresholds(agentId: string, agent: AgentAccumulator): void {
    this.emitIfThreshold('budget:agent', agent.totalTokens, this.config.maxTokensPerAgent, { agentId });
    this.emitIfThreshold('budget:session', this.sessionTotalTokens, this.config.maxTokensPerSession);
    this.emitIfCostThreshold(this.sessionCostUsd, this.config.maxBudgetUSD);
  }

  private emitIfThreshold(prefix: string, usage: number, limit?: number, extra?: Record<string, unknown>): void {
    if (!limit) return;
    const ratio = usage / limit;
    if (ratio >= LIMIT_THRESHOLD) {
      this.emit(`${prefix}-limit`, { ...extra, usage, limit });
    } else if (ratio >= WARNING_THRESHOLD) {
      this.emit(`${prefix}-warning`, { ...extra, usage, limit, percent: Math.round(ratio * 100) });
    }
  }

  private emitIfCostThreshold(costUsd: number, limit?: number): void {
    if (!limit) return;
    const ratio = costUsd / limit;
    if (ratio >= LIMIT_THRESHOLD) {
      this.emit('budget:cost-limit', { costUsd, limit });
    } else if (ratio >= WARNING_THRESHOLD) {
      this.emit('budget:cost-warning', { costUsd, limit, percent: Math.round(ratio * 100) });
    }
  }
}
