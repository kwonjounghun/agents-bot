/**
 * StreamRouter Service
 * Single Responsibility: Track active agent context for message routing
 *
 * This module handles:
 * - Tracking active agent context via a stack (for nested agent support)
 * - Agent ID mapping for transcript and toolUseId routing
 *
 * ============================================================================
 * IMPORTANT: ID 매칭 관련 주의사항
 * ============================================================================
 * SDK agentId와 JSONL/파일경로 agentId는 형식이 다릅니다!
 *
 * - SDK agentId: 전체 UUID/긴 해시 (예: "toolu_01ABCdef123456")
 * - JSONL agentId: 7자리 짧은 해시 (예: "ab215e8")
 * - transcriptAgentId: JSONL의 agentId와 동일
 *
 * getAgentByTranscriptId()는 transcriptAgentId -> SDK agentId 매핑을 처리합니다.
 * 매핑은 pushContext() 호출 시 설정됩니다.
 *
 * 자세한 내용은 src/main/services/utils/agentIdMatcher.ts 참조
 * ============================================================================
 */

import type { AgentRole } from '../../shared/types';
import { AgentIdMapper, createAgentIdMapper } from './routing/agentIdMapper';

// Agent type normalization (from oh-my-claudecode:xxx to xxx)
const AGENT_TYPE_PREFIX = 'oh-my-claudecode:';

// Map SDK built-in agent types to our agent types (moved to module scope for performance)
const AGENT_TYPE_MAP: Readonly<Record<string, string>> = {
  'general-purpose': 'executor',
  'general': 'executor',
  'default': 'executor',
  'plan': 'planner',
  'bash': 'executor',
  'explorer': 'explore',
};

/**
 * Represents an active agent context in the execution stack
 */
export interface AgentContext {
  agentId: string;
  agentType: string;
  normalizedRole: AgentRole;
  startTime: number;
  isTeamMember: boolean;
  /** Tool use ID that spawned this agent (for message routing) */
  toolUseId?: string;
}

/**
 * Configuration for StreamRouter
 */
export interface StreamRouterConfig {
  /** Maximum number of agents in the context stack (default: 10) */
  maxContextDepth: number;
}

const DEFAULT_CONFIG: StreamRouterConfig = {
  maxContextDepth: 10,
};

/**
 * Normalizes SDK agent type to a simple role name
 * e.g., "oh-my-claudecode:executor" -> "executor"
 * e.g., "Explore" -> "explore"
 */
export function normalizeAgentType(agentType: string): AgentRole {
  if (!agentType) return 'executor';

  // Remove oh-my-claudecode: prefix if present
  let normalized = agentType;
  if (normalized.startsWith(AGENT_TYPE_PREFIX)) {
    normalized = normalized.slice(AGENT_TYPE_PREFIX.length);
  }

  // Convert to lowercase for consistent matching
  normalized = normalized.toLowerCase();

  // Use module-scope map for better performance
  if (AGENT_TYPE_MAP[normalized]) {
    return AGENT_TYPE_MAP[normalized];
  }

  return normalized;
}

/**
 * StreamRouter manages agent context for message routing.
 * It maintains a context stack to track which agent is currently active,
 * enabling correct message routing even with nested agent execution.
 */
export class StreamRouter {
  private contextStack: AgentContext[] = [];
  private config: StreamRouterConfig;
  /** Agent ID mapper for routing subagent messages */
  private idMapper: AgentIdMapper = createAgentIdMapper();

  constructor(config: Partial<StreamRouterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Push a new agent context onto the stack (called on SubagentStart)
   *
   * @param agentId - SDK's agent_id
   * @param agentType - Agent type string
   * @param isTeamMember - Whether this is a team member agent
   * @param toolUseId - Parent tool_use_id for routing
   * @param transcriptAgentId - Short agentId from JSONL (e.g., "ab215e8")
   */
  async pushContext(
    agentId: string,
    agentType: string,
    isTeamMember: boolean = false,
    toolUseId?: string,
    transcriptAgentId?: string
  ): Promise<AgentContext> {
    // Prevent stack overflow
    if (this.contextStack.length >= this.config.maxContextDepth) {
      console.warn(
        `[StreamRouter] Context stack depth limit reached (${this.config.maxContextDepth}). ` +
        `Ignoring nested agent: ${agentType}`
      );
      // Return a dummy context but don't push
      return {
        agentId,
        agentType,
        normalizedRole: normalizeAgentType(agentType),
        startTime: Date.now(),
        isTeamMember,
        toolUseId,
      };
    }

    const normalizedRole = normalizeAgentType(agentType);
    const context: AgentContext = {
      agentId,
      agentType,
      normalizedRole,
      startTime: Date.now(),
      isTeamMember,
      toolUseId,
    };

    this.contextStack.push(context);

    // Store ID mappings for message routing
    if (toolUseId) {
      this.idMapper.setToolUseMapping(toolUseId, agentId);
    }
    if (transcriptAgentId) {
      this.idMapper.setTranscriptMapping(transcriptAgentId, agentId);
    }

    console.log(
      `[StreamRouter] Agent started: ${normalizedRole} (${agentId}), ` +
      `stack depth: ${this.contextStack.length}`
    );

    return context;
  }

  /**
   * Pop an agent context from the stack (called on SubagentStop)
   */
  popContext(agentId: string): AgentContext | undefined {
    const idx = this.contextStack.findIndex((c) => c.agentId === agentId);

    if (idx < 0) {
      console.warn(`[StreamRouter] Agent not found in stack: ${agentId}`);
      return undefined;
    }

    const [context] = this.contextStack.splice(idx, 1);

    // Clean up toolUseId mapping
    if (context.toolUseId) {
      this.idMapper.removeToolUseMapping(context.toolUseId);
    }

    console.log(
      `[StreamRouter] Agent stopped: ${context.normalizedRole} (${agentId}), ` +
      `stack depth: ${this.contextStack.length}`
    );

    return context;
  }

  /**
   * Get the currently active agent (top of stack)
   */
  getCurrentAgent(): AgentContext | null {
    if (this.contextStack.length === 0) {
      return null;
    }
    return this.contextStack[this.contextStack.length - 1];
  }

  /**
   * Get all active agents
   */
  getAllAgents(): AgentContext[] {
    return [...this.contextStack];
  }

  /**
   * Check if an agent is in the context stack
   */
  hasAgent(agentId: string): boolean {
    return this.contextStack.some((c) => c.agentId === agentId);
  }

  /**
   * Get agent context by ID
   */
  getAgentContext(agentId: string): AgentContext | undefined {
    return this.contextStack.find((c) => c.agentId === agentId);
  }

  /**
   * Get agent context by toolUseId (parent_tool_use_id from SDK messages)
   */
  getAgentByToolUseId(toolUseId: string): AgentContext | undefined {
    const agentId = this.idMapper.getAgentIdByToolUseId(toolUseId);
    if (!agentId) {
      return undefined;
    }
    return this.getAgentContext(agentId);
  }

  /**
   * Get agent context by transcriptAgentId (agentId from JSONL transcript)
   * This is used for ESP-style transcript routing where JSONL contains short agentId
   */
  getAgentByTranscriptId(transcriptAgentId: string): AgentContext | undefined {
    // First try direct match (SDK agentId might be same as transcript agentId)
    let context = this.getAgentContext(transcriptAgentId);
    if (context) {
      return context;
    }

    // Try mapping from transcriptAgentId to SDK agentId
    const sdkAgentId = this.idMapper.getAgentIdByTranscriptId(transcriptAgentId);
    if (sdkAgentId) {
      return this.getAgentContext(sdkAgentId);
    }

    // Fallback: try partial match (first 7 chars)
    const shortId = transcriptAgentId.substring(0, 7);
    context = this.contextStack.find((c) =>
      c.agentId.startsWith(shortId) || c.agentId.includes(shortId)
    );
    if (context) {
      console.log(`[StreamRouter] Partial match: transcriptAgentId ${transcriptAgentId} -> ${context.agentId}`);
    }
    return context;
  }

  /**
   * Clear all contexts
   */
  clear(): void {
    this.contextStack = [];
    this.idMapper.clear();
    console.log('[StreamRouter] Cleared all agent contexts and ID mappings');
  }

  /**
   * Get current stack depth
   */
  getStackDepth(): number {
    return this.contextStack.length;
  }
}

/**
 * Create a new StreamRouter instance with optional configuration
 */
export function createStreamRouter(config?: Partial<StreamRouterConfig>): StreamRouter {
  return new StreamRouter(config);
}
