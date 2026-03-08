/**
 * Transcript Message Handler Service
 *
 * Routes transcript messages from JSONL files to appropriate widgets.
 * Single responsibility: transcript message processing and routing.
 *
 * Extracted from index.ts to improve testability and separation of concerns.
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
   * Filter messages that should not be processed
   */
  function shouldSkipMessage(message: TranscriptMessage): boolean {
    // Only show thinking and text messages (skip tool_use and tool_result)
    if (message.type === 'tool_use' || message.type === 'tool_result') {
      return true;
    }

    // Skip messages without agentId
    if (!message.agentId) {
      return true;
    }

    return false;
  }

  /**
   * Map transcript message type to MessageType
   */
  function mapMessageType(type: TranscriptMessage['type']): 'thinking' | 'text' | 'tool_use' {
    switch (type) {
      case 'thinking':
        return 'thinking';
      case 'tool_use':
        return 'tool_use';
      default:
        return 'text';
    }
  }

  /**
   * Accumulate content and return the accumulated result
   */
  function accumulateContent(accum: MessageAccumulator, message: TranscriptMessage): string {
    if (message.type === 'thinking') {
      accum.thinking += message.content + '\n';
      return accum.thinking;
    } else {
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
    messageType: 'thinking' | 'text' | 'tool_use' | 'speaking',
    content: string,
  ): void {
    if (!teamManager) return;

    const activeTeam = teamManager.getActiveTeam();
    if (!activeTeam) return;

    // Find agent in team and add message
    const agent = activeTeam.agents.get(agentId);
    if (agent) {
      teamManager.addAgentMessage(activeTeam.id, agentId, {
        id: `msg-${Date.now()}`,
        type: messageType,
        content: content.trim(),
        timestamp: Date.now(),
        isStreaming: true,
      });
    }
  }

  return {
    handleMessage(message: TranscriptMessage): void {
      // Filter unwanted messages
      if (shouldSkipMessage(message)) {
        return;
      }

      // Route transcript content to the widget via StreamRouter
      // Use getAgentByTranscriptId for JSONL agentId matching (claude-esp style)
      const agentContext = streamRouter?.getAgentByTranscriptId(message.agentId!);
      if (!agentContext) {
        return;
      }

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
    },
  };
}
