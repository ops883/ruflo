/**
 * Model Environment Variables (Claude Code Compatible)
 *
 * This module provides environment variable support for model selection,
 * following Claude Code's conventions:
 * - ANTHROPIC_SMALL_FAST_MODEL / ANTHROPIC_DEFAULT_HAIKU_MODEL: For fast/light tasks
 * - ANTHROPIC_MODEL: For balanced tasks
 * - ANTHROPIC_CAPABLE_MODEL: For complex tasks
 *
 * This minimal change approach allows users to override default models
 * without modifying provider configuration.
 *
 * Supports both built-in models (haiku, sonnet, opus) and custom models
 * (e.g., glm-5, qwen3-coder, etc.)
 */

/**
 * Built-in model types for Claude Code
 */
export type BuiltInModelType = 'haiku' | 'sonnet' | 'opus';

/**
 * Model type - can be built-in or custom model name
 */
export type ModelType = BuiltInModelType | string;

/**
 * Check if a model is a built-in Claude model
 */
export function isBuiltInModel(model: string): model is BuiltInModelType {
  return model === 'haiku' || model === 'sonnet' || model === 'opus';
}

/**
 * Get the small/fast model from environment (Claude Code compatible)
 * Priority: ANTHROPIC_SMALL_FAST_MODEL > ANTHROPIC_DEFAULT_HAIKU_MODEL > default
 * Supports custom model names (e.g., glm-5, qwen3-coder)
 */
export function getSmallFastModel(): ModelType {
  const model = process.env.ANTHROPIC_SMALL_FAST_MODEL
    || process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL;

  if (model) {
    return model;  // Return user's custom or built-in model
  }
  return 'haiku';  // Default fallback
}

/**
 * Get the balanced model from environment
 * Priority: ANTHROPIC_MODEL > default
 * Supports custom model names
 */
export function getBalancedModel(): ModelType {
  const model = process.env.ANTHROPIC_MODEL;

  if (model) {
    return model;  // Return user's custom or built-in model
  }
  return 'sonnet';  // Default fallback
}

/**
 * Get the capable model from environment
 * Priority: ANTHROPIC_CAPABLE_MODEL > default
 * Supports custom model names
 */
export function getCapableModel(): ModelType {
  const model = process.env.ANTHROPIC_CAPABLE_MODEL;

  if (model) {
    return model;  // Return user's custom or built-in model
  }
  return 'opus';  // Default fallback
}

/**
 * Get model by tier, respecting environment variables
 */
export function getModelByTier(tier: 'fast' | 'balanced' | 'capable'): ModelType {
  switch (tier) {
    case 'fast':
      return getSmallFastModel();
    case 'balanced':
      return getBalancedModel();
    case 'capable':
      return getCapableModel();
    default:
      return getBalancedModel();
  }
}

/**
 * Agent type to model tier mapping
 * This determines which tier of model each agent type should use
 */
export const AGENT_MODEL_TIERS = {
  fast: ['formatter', 'linter', 'documenter'],
  balanced: ['coder', 'reviewer', 'researcher', 'tester', 'analyst', 'planner'],
  capable: ['architect', 'security-architect', 'system-architect', 'core-architect']
} as const;

/**
 * Get model for a specific agent type
 * Respects environment variables and agent tier mapping
 */
export function getModelForAgentType(agentType: string): ModelType {
  if (AGENT_MODEL_TIERS.fast.includes(agentType as any)) {
    return getSmallFastModel();
  }
  if (AGENT_MODEL_TIERS.capable.includes(agentType as any)) {
    return getCapableModel();
  }
  return getBalancedModel();
}