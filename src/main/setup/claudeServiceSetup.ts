/**
 * Claude Service Setup
 * Single Responsibility: Create and configure ClaudeAgentService with event handlers
 *
 * Uses dependency injection for external services to enable testing and loose coupling.
 */

import {
  ClaudeAgentService,
  ClaudeAgentMessage,
  AgentStartEvent,
  AgentStopEvent,
} from '../claudeAgentService';
import type { StreamRouter } from '../services/streamRouter';
import type { TranscriptWatcher } from '../services/transcriptWatcher';
import type { TeamManager } from '../services/teamManager';
import type { AgentStatus } from '../../shared/types';

/**
 * Dependencies required for Claude service setup
 */
export interface ClaudeServiceDependencies {
  /** The team this service instance belongs to. Used for scoped message routing. */
  teamId: string;
  streamRouter: StreamRouter | null;
  transcriptWatcher: TranscriptWatcher | null;
  teamManager: TeamManager | null;
  normalizeAgentType: (agentType: string) => string;
  sendToRenderer: (channel: string, data: unknown) => void;
  getMessageIds: () => { textId: string | null; thinkingId: string | null };
  setMessageIds: (textId: string | null, thinkingId: string | null) => void;
  clearTranscriptAccumulator: (agentId: string) => void;
}

/**
 * Setup Claude service with all event handlers
 *
 * @param deps - External dependencies
 * @returns Configured ClaudeAgentService instance
 */
export function setupClaudeService(deps: ClaudeServiceDependencies): ClaudeAgentService {
  const claudeService = new ClaudeAgentService();

  setupAgentLifecycleHandlers(claudeService, deps);
  setupMessageHandlers(claudeService, deps);

  return claudeService;
}

/**
 * Setup agent start/stop lifecycle handlers
 */
function setupAgentLifecycleHandlers(
  claudeService: ClaudeAgentService,
  deps: ClaudeServiceDependencies
): void {
  // Auto-detect agent starts from SDK hooks
  claudeService.on('agentStart', async (event: AgentStartEvent) => {
    const normalizedRole = deps.normalizeAgentType(event.agentType);

    // Check if StreamRouter already has this agent
    if (deps.streamRouter?.hasAgent(event.agentId)) {
      return;
    }

    // Push context to StreamRouter
    await deps.streamRouter?.pushContext(
      event.agentId,
      event.agentType,
      false,
      event.toolUseId,
      event.transcriptAgentId
    );

    // Add agent to team for UI tracking
    deps.teamManager?.addAgent(deps.teamId, {
      id: event.agentId,
      role: normalizedRole,
      isLeader: false,
      parentToolUseId: event.toolUseId,
      status: 'thinking',
    });

    // Start watching transcript for this agent
    // Pass transcriptFilePath for direct file watching (most reliable — bypasses directory scanning)
    if (deps.transcriptWatcher) {
      deps.transcriptWatcher.startWatching(event.agentId, event.transcriptAgentId, event.transcriptFilePath);
    }

    deps.sendToRenderer('team:agent-joined', {
      teamId: deps.teamId,
      agentId: event.agentId,
      role: normalizedRole,
    });
  });

  // Auto-detect agent stops from SDK hooks
  claudeService.on('agentStop', (event: AgentStopEvent) => {
    // Stop watching transcript
    if (deps.transcriptWatcher) {
      deps.transcriptWatcher.stopWatching(event.agentId);
    }

    // Clear transcript accumulator
    deps.clearTranscriptAccumulator(event.agentId);

    // Pop context from StreamRouter
    const context = deps.streamRouter?.popContext(event.agentId);

    // Update agent status and schedule removal from team
    deps.teamManager?.updateAgentStatus(deps.teamId, event.agentId, 'complete');
    setTimeout(() => {
      deps.teamManager?.removeAgent(deps.teamId, event.agentId);
    }, 3000);

    if (context) {
      deps.sendToRenderer('team:agent-completed', {
        teamId: deps.teamId,
        agentId: event.agentId,
        role: context.normalizedRole,
      });
    }
  });

  // Handle available agents list
  claudeService.on('agentsAvailable', (agents: string[]) => {
    deps.sendToRenderer('team:agents-available', { teamId: deps.teamId, agents });
  });
}

/**
 * Leader message accumulator state for grouping messages by type
 */
interface LeaderMessageState {
  currentType: 'text' | 'thinking' | null;
  currentMessageId: string | null;
  accumulatedContent: string;
}

/**
 * Setup message event handlers with routing logic
 */
function setupMessageHandlers(
  claudeService: ClaudeAgentService,
  deps: ClaudeServiceDependencies
): void {
  // Per-invocation leader message state (scoped to this service instance / team)
  const leaderState: LeaderMessageState = {
    currentType: null,
    currentMessageId: null,
    accumulatedContent: '',
  };

  function resetLeaderState(): void {
    leaderState.currentType = null;
    leaderState.currentMessageId = null;
    leaderState.accumulatedContent = '';
  }

  claudeService.on('message', (message: ClaudeAgentMessage) => {
    switch (message.type) {
      case 'text':
        handleStreamingMessage('text', message, deps, leaderState);
        break;
      case 'thinking':
        handleStreamingMessage('thinking', message, deps, leaderState);
        break;
      case 'tool_use':
        resetLeaderState();
        handleToolUseMessage(message, deps);
        break;
      case 'result':
        resetLeaderState();
        handleResultMessage(message, deps);
        break;
      case 'error':
        resetLeaderState();
        handleErrorMessage(message, deps);
        break;
    }
  });
}

/**
 * Handle text and thinking messages (unified streaming handler)
 */
function handleStreamingMessage(
  messageType: 'text' | 'thinking',
  message: ClaudeAgentMessage,
  deps: ClaudeServiceDependencies,
  leaderState: LeaderMessageState
): void {
  // Route leader messages (no parentToolUseId) to TeamManager using captured teamId
  if (!message.parentToolUseId && deps.teamManager) {
    const team = deps.teamManager.getTeam(deps.teamId);
    if (team) {
      // Skip if content equals accumulated (duplicate final message)
      if (leaderState.accumulatedContent === message.content) {
        return;
      }

      if (leaderState.currentType !== messageType) {
        // Type changed → new message bubble
        const msgId = `leader-${messageType}-${deps.teamId}-${Date.now()}`;
        leaderState.currentType = messageType;
        leaderState.currentMessageId = msgId;
        leaderState.accumulatedContent = message.content;

        deps.teamManager.addAgentMessage(team.id, team.leaderId, {
          id: msgId,
          type: messageType,
          content: message.content,
          timestamp: Date.now(),
          isStreaming: true,
        });
      } else {
        // Same type → accumulate
        leaderState.accumulatedContent += message.content;

        if (leaderState.currentMessageId) {
          deps.teamManager.updateLastAgentMessage(
            team.id,
            team.leaderId,
            leaderState.accumulatedContent
          );
        }
      }
    }
  }

  // Update per-team streaming message IDs
  const ids = deps.getMessageIds();
  if (messageType === 'text') {
    const newTextId = ids.textId || `text-${deps.teamId}-${Date.now()}`;
    deps.setMessageIds(newTextId, ids.thinkingId);
  } else {
    const newThinkingId = ids.thinkingId || `thinking-${deps.teamId}-${Date.now()}`;
    deps.setMessageIds(ids.textId, newThinkingId);
  }
}

/**
 * Handle tool use messages
 */
function handleToolUseMessage(
  message: ClaudeAgentMessage,
  deps: ClaudeServiceDependencies,
): void {
  deps.setMessageIds(null, null);

  // Route leader tool_use messages to TeamManager using captured teamId
  if (!message.parentToolUseId && deps.teamManager) {
    const team = deps.teamManager.getTeam(deps.teamId);
    if (team) {
      const msgId = `leader-tool-${deps.teamId}-${Date.now()}`;
      const toolContent = message.toolInput
        ? `${message.toolName || 'Tool'}\n${message.toolInput}`
        : message.toolName || 'Tool';

      deps.teamManager.addAgentMessage(team.id, team.leaderId, {
        id: msgId,
        type: 'tool_use',
        content: toolContent,
        toolName: message.toolName,
        timestamp: Date.now(),
        isStreaming: false,
      });
    }
  }
}

/**
 * Handle result messages
 */
function handleResultMessage(
  message: ClaudeAgentMessage,
  deps: ClaudeServiceDependencies,
): void {
  deps.setMessageIds(null, null);

  deps.sendToRenderer('team:query-result', {
    teamId: deps.teamId,
    result: message.content,
    costUsd: message.costUsd || 0,
    turns: message.turns || 0,
  });

  // Route leader result to TeamManager using captured teamId
  if (!message.parentToolUseId && deps.teamManager) {
    const team = deps.teamManager.getTeam(deps.teamId);
    if (team) {
      const msgId = `leader-result-${deps.teamId}-${Date.now()}`;
      const resultContent = message.costUsd !== undefined
        ? `${message.content}\n\n💰 Cost: $${message.costUsd.toFixed(4)} | Turns: ${message.turns || 0}`
        : message.content;

      deps.teamManager.addAgentMessage(team.id, team.leaderId, {
        id: msgId,
        type: 'result',
        content: resultContent,
        timestamp: Date.now(),
        isStreaming: false,
      });
    }
  }
}

/**
 * Handle error messages
 */
function handleErrorMessage(
  message: ClaudeAgentMessage,
  deps: ClaudeServiceDependencies,
): void {
  deps.setMessageIds(null, null);

  deps.sendToRenderer('team:query-error', {
    teamId: deps.teamId,
    error: message.content,
  });

  // Route leader error to TeamManager using captured teamId
  if (!message.parentToolUseId && deps.teamManager) {
    const team = deps.teamManager.getTeam(deps.teamId);
    if (team) {
      const msgId = `leader-error-${deps.teamId}-${Date.now()}`;

      deps.teamManager.addAgentMessage(team.id, team.leaderId, {
        id: msgId,
        type: 'error',
        content: message.content,
        timestamp: Date.now(),
        isStreaming: false,
      });
    }
  }
}
