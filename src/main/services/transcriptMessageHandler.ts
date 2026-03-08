/**
 * Transcript Message Handler Service
 *
 * Routes transcript messages from JSONL files to appropriate widgets.
 * Single responsibility: transcript message processing and routing.
 *
 * Extracted from index.ts to improve testability and separation of concerns.
 */

import type { StreamRouter } from './streamRouter';
import type { WidgetManager } from '../widgetManager';
import type { LeaderAgentManager } from '../leaderAgentManager';
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
  widgetManager: WidgetManager;
  leaderManager: LeaderAgentManager | null;
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

  /**
   * Update leader manager reference
   */
  setLeaderManager(leaderManager: LeaderAgentManager | null): void;
}

/**
 * Create a transcript message handler instance
 */
export function createTranscriptMessageHandler(
  config: TranscriptMessageHandlerConfig
): TranscriptMessageHandler {
  const { streamRouter, widgetManager } = config;
  let leaderManager = config.leaderManager;

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
    // Skip tool_result only (too verbose), but show thinking, text, and tool_use
    if (message.type === 'tool_result') {
      return true;
    }

    // Skip messages without agentId
    if (!message.agentId) {
      console.log('[TranscriptHandler] Message without agentId, skipping');
      return true;
    }

    return false;
  }

  /**
   * Map transcript message type to widget message type
   */
  function mapMessageType(type: TranscriptMessage['type']): 'thinking' | 'speaking' | 'tool_use' {
    switch (type) {
      case 'thinking':
        return 'thinking';
      case 'tool_use':
        return 'tool_use';
      default:
        return 'speaking';
    }
  }

  /**
   * Accumulate content and return the accumulated result
   */
  function accumulateContent(
    accum: MessageAccumulator,
    message: TranscriptMessage
  ): string {
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
   * Route message to appropriate widget
   */
  function routeToWidget(
    agentId: string,
    normalizedRole: string,
    widgetType: 'thinking' | 'speaking' | 'tool_use',
    content: string
  ): void {
    const messageData = {
      agentId,
      role: normalizedRole,
      type: widgetType,
      content: content.trim(),
      timestamp: Date.now(),
      isNewSection: false
    };

    console.log('[TranscriptHandler] routeToWidget:', {
      agentId,
      role: normalizedRole,
      type: widgetType,
      contentLength: content.length,
      hasLeader: leaderManager?.hasLeader()
    });

    // Route to LeaderAgentManager (which owns the sub-agent widgets)
    if (leaderManager?.hasLeader()) {
      console.log('[TranscriptHandler] Sending to LeaderAgentManager.sendToSubAgent');
      leaderManager.sendToSubAgent(agentId, 'widget:message', messageData);
    } else {
      // Fallback to WidgetManager for non-leader mode
      console.log('[TranscriptHandler] Sending to WidgetManager.sendMessageToWidget');
      widgetManager?.sendMessageToWidget(messageData);
    }
  }

  return {
    handleMessage(message: TranscriptMessage): void {
      console.log('[TranscriptHandler] handleMessage called:', {
        type: message.type,
        agentId: message.agentId,
        contentLength: message.content?.length || 0,
        contentPreview: message.content?.substring(0, 80)
      });

      // Filter unwanted messages
      if (shouldSkipMessage(message)) {
        console.log('[TranscriptHandler] Message skipped by filter:', message.type);
        return;
      }

      // Route transcript content to the widget via StreamRouter
      // Use getAgentByTranscriptId for JSONL agentId matching (claude-esp style)
      const agentContext = streamRouter?.getAgentByTranscriptId(message.agentId!);
      if (!agentContext) {
        console.log('[TranscriptHandler] No agent context found for agentId:', message.agentId);
        return;
      }

      console.log(
        '[TranscriptHandler] Routing: JSONL agentId',
        message.agentId,
        '-> SDK agentId',
        agentContext.agentId
      );

      // Get or create accumulator for this agent
      const accum = getAccumulator(message.agentId!);

      // Map message type and accumulate content
      const widgetType = mapMessageType(message.type);
      const accumulatedContent = accumulateContent(accum, message);

      // Route to appropriate widget
      routeToWidget(
        agentContext.agentId,
        agentContext.normalizedRole,
        widgetType,
        accumulatedContent
      );
    },

    clearAccumulator(agentId: string): void {
      accumulators.delete(agentId);
    },

    clearAllAccumulators(): void {
      accumulators.clear();
    },

    setLeaderManager(manager: LeaderAgentManager | null): void {
      leaderManager = manager;
    }
  };
}
