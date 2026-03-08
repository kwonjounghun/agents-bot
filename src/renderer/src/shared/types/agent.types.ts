/**
 * Shared Agent Types
 *
 * Agent role types and configuration interfaces.
 */

/**
 * Available agent roles
 */
export type AgentRole =
  | 'executor'
  | 'architect'
  | 'planner'
  | 'explorer'
  | 'analyst'
  | 'critic'
  | 'verifier'
  | 'debugger'
  | 'designer'
  | 'writer'
  | 'tester'
  | 'reviewer'
  | 'security'
  | 'build-fixer'
  | 'deep-executor'
  | 'document-specialist'
  | 'quality-reviewer'
  | 'test-engineer'
  | 'code-reviewer'
  | 'security-reviewer'
  | string; // Allow custom roles

/**
 * Agent visual configuration
 */
export interface AgentConfig {
  name: string;
  emoji: string;
  color: string;
  description?: string;
}

/**
 * Sub-agent info for tracking
 */
export interface SubAgentInfo {
  agentId: string;
  role: AgentRole;
  status: import('./status.types').AgentStatus;
}
