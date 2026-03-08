/**
 * Agent ID Mapper
 * Single Responsibility: Map between different agent ID formats
 *
 * Handles:
 * - toolUseId -> agentId mapping (for SDK message routing)
 * - transcriptAgentId -> agentId mapping (for JSONL transcript routing)
 */

/**
 * Lookup query for finding an agent
 */
export interface AgentLookupQuery {
  id?: string;
  toolUseId?: string;
  transcriptId?: string;
}

/**
 * AgentIdMapper manages the mapping between different agent ID formats.
 * This enables routing messages from various sources to the correct agent.
 */
export class AgentIdMapper {
  /** Map of toolUseId -> agentId for routing subagent messages */
  private toolUseIdToAgentId: Map<string, string> = new Map();

  /** Map of transcriptAgentId (JSONL agentId) -> SDK agentId for transcript routing */
  private transcriptAgentIdMap: Map<string, string> = new Map();

  /**
   * Set toolUseId -> agentId mapping
   */
  setToolUseMapping(toolUseId: string, agentId: string): void {
    this.toolUseIdToAgentId.set(toolUseId, agentId);
    console.log(`[AgentIdMapper] Mapped toolUseId ${toolUseId} -> agentId ${agentId}`);
  }

  /**
   * Remove toolUseId mapping
   */
  removeToolUseMapping(toolUseId: string): void {
    this.toolUseIdToAgentId.delete(toolUseId);
    console.log(`[AgentIdMapper] Removed toolUseId mapping: ${toolUseId}`);
  }

  /**
   * Get agentId by toolUseId
   */
  getAgentIdByToolUseId(toolUseId: string): string | undefined {
    return this.toolUseIdToAgentId.get(toolUseId);
  }

  /**
   * Set transcriptAgentId -> agentId mapping
   */
  setTranscriptMapping(transcriptAgentId: string, agentId: string): void {
    this.transcriptAgentIdMap.set(transcriptAgentId, agentId);
    console.log(`[AgentIdMapper] Mapped transcriptAgentId ${transcriptAgentId} -> agentId ${agentId}`);
  }

  /**
   * Remove transcriptAgentId mapping
   */
  removeTranscriptMapping(transcriptAgentId: string): void {
    this.transcriptAgentIdMap.delete(transcriptAgentId);
  }

  /**
   * Get agentId by transcriptAgentId
   */
  getAgentIdByTranscriptId(transcriptAgentId: string): string | undefined {
    return this.transcriptAgentIdMap.get(transcriptAgentId);
  }

  /**
   * Find agentId using a lookup query
   * Tries each provided key in order: id, toolUseId, transcriptId
   */
  findAgentId(query: AgentLookupQuery): string | undefined {
    if (query.id) {
      return query.id;
    }
    if (query.toolUseId) {
      return this.getAgentIdByToolUseId(query.toolUseId);
    }
    if (query.transcriptId) {
      return this.getAgentIdByTranscriptId(query.transcriptId);
    }
    return undefined;
  }

  /**
   * Clear all mappings
   */
  clear(): void {
    this.toolUseIdToAgentId.clear();
    this.transcriptAgentIdMap.clear();
    console.log('[AgentIdMapper] Cleared all mappings');
  }

  /**
   * Get the number of toolUseId mappings
   */
  get toolUseMappingCount(): number {
    return this.toolUseIdToAgentId.size;
  }

  /**
   * Get the number of transcriptAgentId mappings
   */
  get transcriptMappingCount(): number {
    return this.transcriptAgentIdMap.size;
  }
}

/**
 * Create a new AgentIdMapper instance
 */
export function createAgentIdMapper(): AgentIdMapper {
  return new AgentIdMapper();
}
