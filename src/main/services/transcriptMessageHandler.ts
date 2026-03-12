/**
 * Transcript Message Handler Service
 *
 * Routes transcript messages from JSONL files to appropriate widgets.
 * Single responsibility: transcript message processing and routing.
 *
 * Extracted from index.ts to improve testability and separation of concerns.
 *
 * ============================================================================
 * IMPORTANT: ID 매칭 관련 주의사항
 * ============================================================================
 * 이 모듈로 전달되는 message.agentId는 이미 TranscriptWatcher에서
 * SDK agentId로 변환되어 있어야 합니다.
 *
 * 만약 ID 매칭 문제가 발생하면:
 * 1. TranscriptWatcher의 ID 매칭 로직 확인
 * 2. utils/agentIdMatcher.ts의 매칭 함수 확인
 * 3. StreamRouter의 ID 매핑 확인
 *
 * 자세한 내용은 src/main/services/utils/agentIdMatcher.ts 참조
 * ============================================================================
 */

import type { StreamRouter } from './streamRouter';
import type { TeamManager } from './teamManager';
import type { TranscriptMessage } from './transcriptWatcher';

/**
 * Accumulator for transcript content per agent
 */
export interface MessageAccumulator {
  text: string;
  thinking: string;
  tool_use: string;
  tool_result: string;
}

/**
 * Configuration for TranscriptMessageHandler
 */
export interface TranscriptMessageHandlerConfig {
  streamRouter: StreamRouter;
  teamManager: TeamManager | null;
}

/**
 * Transcript Message Handler interface
 */
export interface TranscriptMessageHandler {
  /**
   * Handle incoming transcript message and route to appropriate widget
   */
  handleMessage(message: TranscriptMessage): void;

  /**
   * Clear accumulator for a specific agent
   */
  clearAccumulator(agentId: string): void;

  /**
   * Clear all accumulators
   */
  clearAllAccumulators(): void;
}

/**
 * Create a transcript message handler instance
 */
export function createTranscriptMessageHandler(
  config: TranscriptMessageHandlerConfig,
): TranscriptMessageHandler {
  const { streamRouter, teamManager } = config;

  // Internal accumulator state
  const accumulators = new Map<string, MessageAccumulator>();

  // Track toolUseId -> toolName mapping for tool_result filtering
  const toolUseRegistry = new Map<string, string>();

  /**
   * Get or create accumulator for an agent
   */
  function getAccumulator(agentId: string): MessageAccumulator {
    let accum = accumulators.get(agentId);
    if (!accum) {
      accum = { text: '', thinking: '', tool_use: '', tool_result: '' };
      accumulators.set(agentId, accum);
    }
    return accum;
  }

  /**
   * Register a tool_use event for later tool_result correlation (side effect)
   */
  function registerToolUse(toolUseId: string, toolName: string): void {
    toolUseRegistry.set(toolUseId, toolName);
  }

  /**
   * Pure predicate — returns true if the message should be skipped.
   * Has no side effects; call registerToolUse separately before this.
   */
  function shouldSkipMessage(message: TranscriptMessage): boolean {
    if (!message.agentId) return true;
    if (message.type === 'tool_use') return true;

    if (message.type === 'tool_result') {
      const toolName = message.toolUseId ? toolUseRegistry.get(message.toolUseId) : null;
      return toolName !== 'Task';
    }

    return false;
  }

  /**
   * Map transcript message type to MessageType
   */
  function mapMessageType(type: TranscriptMessage['type']): 'thinking' | 'text' | 'tool_use' | 'tool_result' {
    switch (type) {
      case 'thinking':
        return 'thinking';
      case 'tool_use':
        return 'tool_use';
      case 'tool_result':
        return 'tool_result';
      default:
        return 'text';
    }
  }

  /**
   * Accumulate content and return the accumulated result
   */
  function accumulateContent(accum: MessageAccumulator, message: TranscriptMessage): string {
    switch (message.type) {
      case 'thinking':
        accum.thinking += message.content + '\n';
        return accum.thinking;
      case 'tool_use':
        accum.tool_use += message.content + '\n';
        return accum.tool_use;
      case 'tool_result':
        accum.tool_result += message.content + '\n';
        return accum.tool_result;
      default:
        // text type -> speaking
        accum.text += message.content + '\n';
        return accum.text;
    }
  }

  /**
   * Route message to TeamManager
   */
  function routeToTeam(
    agentId: string,
    _normalizedRole: string,
    messageType: 'thinking' | 'text' | 'tool_use' | 'tool_result' | 'speaking',
    content: string,
  ): void {
    console.log('[TranscriptMessageHandler] routeToTeam:', {
      agentId,
      messageType,
      contentPreview: content.substring(0, 50)
    });

    if (!teamManager) {
      console.log('[TranscriptMessageHandler] No teamManager');
      return;
    }

    // Use findTeamByAgentId instead of getActiveTeam() to avoid race conditions
    // when the active team changes while a subagent is still running.
    const activeTeam = teamManager.findTeamByAgentId(agentId);
    if (!activeTeam) {
      console.log('[TranscriptMessageHandler] No team found for agent:', agentId);
      return;
    }

    // Find agent in team and add message
    const agent = activeTeam.agents.get(agentId);
    console.log('[TranscriptMessageHandler] Looking for agent:', agentId, 'in team agents:', Array.from(activeTeam.agents.keys()));
    if (agent) {
      console.log('[TranscriptMessageHandler] Adding message to agent:', agentId, 'type:', messageType);
      teamManager.addAgentMessage(activeTeam.id, agentId, {
        id: `msg-${Date.now()}`,
        type: messageType,
        content: content.trim(),
        timestamp: Date.now(),
        isStreaming: true,
      });
    } else {
      console.log('[TranscriptMessageHandler] Agent not found in team:', agentId);
    }
  }

  return {
    handleMessage(message: TranscriptMessage): void {
      console.log('[TranscriptMessageHandler] handleMessage:', {
        type: message.type,
        agentId: message.agentId,
        contentPreview: message.content?.substring(0, 50)
      });

      // Register tool_use for later tool_result correlation (side effect before pure check)
      if (message.type === 'tool_use' && message.toolUseId && message.toolName) {
        registerToolUse(message.toolUseId, message.toolName);
      }

      // Filter unwanted messages (pure predicate, no side effects)
      if (shouldSkipMessage(message)) {
        console.log('[TranscriptMessageHandler] Skipped message type:', message.type);
        return;
      }

      // Route transcript content to the widget via StreamRouter
      // Use getAgentByTranscriptId for JSONL agentId matching (claude-esp style)
      const agentContext = streamRouter?.getAgentByTranscriptId(message.agentId!);
      if (!agentContext) {
        console.log('[TranscriptMessageHandler] No agent context found for agentId:', message.agentId);
        return;
      }
      console.log('[TranscriptMessageHandler] Found agent context:', agentContext.agentId, agentContext.normalizedRole);

      // Get or create accumulator for this agent
      const accum = getAccumulator(message.agentId!);

      // Map message type and accumulate content
      const widgetType = mapMessageType(message.type);
      const accumulatedContent = accumulateContent(accum, message);

      // Route to team
      routeToTeam(
        agentContext.agentId,
        agentContext.normalizedRole,
        widgetType,
        accumulatedContent,
      );
    },

    clearAccumulator(agentId: string): void {
      accumulators.delete(agentId);
    },

    clearAllAccumulators(): void {
      accumulators.clear();
      toolUseRegistry.clear();
    },
  };
}
