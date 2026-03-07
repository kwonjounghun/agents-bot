/**
 * SDK-OMC Model Routing
 *
 * Intelligent model selection based on agent type, task complexity,
 * and keyword detection. Mirrors oh-my-claudecode's routing logic.
 */

import type { ModelTier, RoutingConfig } from './types';

// Re-export RoutingConfig for convenience
export type { RoutingConfig } from './types';

/**
 * Default model tier assignments for each agent
 */
const AGENT_MODEL_OVERRIDES: Record<string, ModelTier> = {
  // High complexity - use opus
  'architect': 'opus',
  'planner': 'opus',
  'analyst': 'opus',
  'critic': 'opus',
  'deep-executor': 'opus',
  'code-reviewer': 'opus',

  // Medium complexity - use sonnet
  'executor': 'sonnet',
  'verifier': 'sonnet',
  'debugger': 'sonnet',
  'designer': 'sonnet',
  'security-reviewer': 'sonnet',
  'quality-reviewer': 'sonnet',
  'test-engineer': 'sonnet',
  'qa-tester': 'sonnet',
  'scientist': 'sonnet',
  'document-specialist': 'sonnet',

  // Low complexity - use haiku
  'explore': 'haiku',
  'writer': 'haiku'
};

/**
 * Keywords that indicate high complexity (use opus)
 */
const HIGH_COMPLEXITY_KEYWORDS = [
  'architect',
  'architecture',
  'design',
  'refactor',
  'complex',
  'critical',
  'security',
  'performance',
  'optimize',
  'scale',
  'migrate',
  'strategy',
  'deep',
  'thorough',
  'comprehensive'
];

/**
 * Keywords that indicate low complexity (use haiku)
 */
const LOW_COMPLEXITY_KEYWORDS = [
  'scan',
  'search',
  'find',
  'list',
  'quick',
  'simple',
  'basic',
  'check',
  'look',
  'explore',
  'browse'
];

/**
 * Default routing configuration
 */
export const defaultRoutingConfig: RoutingConfig = {
  enabled: true,
  defaultTier: 'sonnet',
  escalationEnabled: true,
  maxEscalations: 2,
  agentOverrides: Object.fromEntries(
    Object.entries(AGENT_MODEL_OVERRIDES).map(([agent, tier]) => [
      agent,
      { tier, reason: 'default agent assignment' }
    ])
  ),
  escalationKeywords: HIGH_COMPLEXITY_KEYWORDS,
  simplificationKeywords: LOW_COMPLEXITY_KEYWORDS
};

/**
 * Get the recommended model for a specific agent
 */
export function getModelForAgent(
  agentName: string,
  config: RoutingConfig = defaultRoutingConfig
): ModelTier {
  // Check config overrides first
  if (config.agentOverrides?.[agentName]) {
    return config.agentOverrides[agentName].tier;
  }

  // Check default overrides
  if (AGENT_MODEL_OVERRIDES[agentName]) {
    return AGENT_MODEL_OVERRIDES[agentName];
  }

  // Return default tier
  return config.defaultTier || 'sonnet';
}

/**
 * Route model based on task description complexity
 */
export function routeModelByComplexity(
  taskDescription: string,
  config: RoutingConfig = defaultRoutingConfig
): ModelTier {
  const lower = taskDescription.toLowerCase();

  // Check for high complexity keywords
  const escalationKeywords = config.escalationKeywords || HIGH_COMPLEXITY_KEYWORDS;
  if (escalationKeywords.some(kw => lower.includes(kw))) {
    return 'opus';
  }

  // Check for low complexity keywords
  const simplificationKeywords = config.simplificationKeywords || LOW_COMPLEXITY_KEYWORDS;
  if (simplificationKeywords.some(kw => lower.includes(kw))) {
    return 'haiku';
  }

  // Return default
  return config.defaultTier || 'sonnet';
}

/**
 * Get model tier with context-aware routing
 */
export function routeModel(
  agentName: string | undefined,
  taskDescription: string,
  config: RoutingConfig = defaultRoutingConfig
): ModelTier {
  if (!config.enabled) {
    return config.defaultTier || 'sonnet';
  }

  // If agent is specified, use agent-based routing
  if (agentName) {
    return getModelForAgent(agentName, config);
  }

  // Otherwise, use task-based routing
  return routeModelByComplexity(taskDescription, config);
}

/**
 * Check if a model should be escalated based on keywords
 */
export function shouldEscalate(
  currentTier: ModelTier,
  context: string,
  config: RoutingConfig = defaultRoutingConfig
): boolean {
  if (!config.escalationEnabled) {
    return false;
  }

  const lower = context.toLowerCase();
  const escalationKeywords = config.escalationKeywords || HIGH_COMPLEXITY_KEYWORDS;

  // Already at highest tier
  if (currentTier === 'opus') {
    return false;
  }

  // Check for escalation triggers
  return escalationKeywords.some(kw => lower.includes(kw));
}

/**
 * Get the next higher model tier
 */
export function escalateTier(currentTier: ModelTier): ModelTier {
  switch (currentTier) {
    case 'haiku':
      return 'sonnet';
    case 'sonnet':
      return 'opus';
    case 'opus':
      return 'opus'; // Already highest
    default:
      return 'sonnet';
  }
}

/**
 * Get the next lower model tier
 */
export function simplifyTier(currentTier: ModelTier): ModelTier {
  switch (currentTier) {
    case 'opus':
      return 'sonnet';
    case 'sonnet':
      return 'haiku';
    case 'haiku':
      return 'haiku'; // Already lowest
    default:
      return 'sonnet';
  }
}

/**
 * Model tier metadata
 */
export const MODEL_TIER_INFO: Record<ModelTier, { description: string; costLevel: string }> = {
  haiku: {
    description: 'Fast, lightweight model for quick lookups and narrow checks',
    costLevel: 'low'
  },
  sonnet: {
    description: 'Balanced model for standard implementation and debugging',
    costLevel: 'medium'
  },
  opus: {
    description: 'Most capable model for architecture, deep analysis, and complex refactors',
    costLevel: 'high'
  }
};
