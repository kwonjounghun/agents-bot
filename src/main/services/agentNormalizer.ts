/**
 * Agent Normalizer Module
 * Single Responsibility: Normalize agent type strings to standard roles
 *
 * This module provides PURE FUNCTIONS for mapping various agent type
 * formats from the SDK to a standardized AgentRole type.
 *
 * Usage:
 *   const role = normalizeAgentType('oh-my-claudecode:executor');
 *   // Returns: 'executor'
 */

export type AgentRole =
  | 'executor'
  | 'explore'
  | 'planner'
  | 'architect'
  | 'debugger'
  | 'verifier'
  | 'analyst'
  | 'designer'
  | 'writer'
  | 'test-engineer'
  | 'build-fixer'
  | 'security-reviewer'
  | 'code-reviewer'
  | 'quality-reviewer'
  | string;

/**
 * Default agent type mappings.
 * Maps SDK built-in agent types to standardized roles.
 */
export const DEFAULT_AGENT_TYPE_MAP: Record<string, AgentRole> = {
  'general-purpose': 'executor',
  'general': 'executor',
  'default': 'executor',
  'plan': 'planner',
  'bash': 'executor',
  'explorer': 'explore',
};

/**
 * Create an agent normalizer with custom mappings.
 *
 * @param customMappings - Additional or override mappings
 * @returns Normalizer function
 */
export function createAgentNormalizer(
  customMappings: Record<string, AgentRole> = {}
): (agentType: string) => AgentRole {
  const mappings = { ...DEFAULT_AGENT_TYPE_MAP, ...customMappings };

  return (agentType: string): AgentRole => {
    return normalizeAgentType(agentType, mappings);
  };
}

/**
 * Normalize an agent type string to a standard AgentRole.
 *
 * Handles various formats:
 * - "oh-my-claudecode:executor" -> "executor"
 * - "Explore" -> "explore"
 * - "general-purpose" -> "executor"
 *
 * @param agentType - The raw agent type string from SDK
 * @param mappings - Optional custom mappings
 * @returns Normalized AgentRole
 */
export function normalizeAgentType(
  agentType: string,
  mappings: Record<string, AgentRole> = DEFAULT_AGENT_TYPE_MAP
): AgentRole {
  if (!agentType) {
    return 'executor';
  }

  // Remove oh-my-claudecode: prefix
  let normalized = agentType.replace(/^oh-my-claudecode:/i, '');

  // Convert to lowercase
  normalized = normalized.toLowerCase();

  // Check mappings
  if (mappings[normalized]) {
    return mappings[normalized];
  }

  // Return as-is if no mapping found
  return normalized as AgentRole;
}

/**
 * Get all known agent type mappings.
 */
export function getTypeMappings(): Record<string, AgentRole> {
  return { ...DEFAULT_AGENT_TYPE_MAP };
}

/**
 * Check if an agent type is a known type.
 */
export function isKnownAgentType(agentType: string): boolean {
  const normalized = agentType.replace(/^oh-my-claudecode:/i, '').toLowerCase();
  return normalized in DEFAULT_AGENT_TYPE_MAP;
}
