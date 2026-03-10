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
  streamRouter: StreamRouter | null;
  transcriptWatcher: TranscriptWatcher | null;
  teamManager: TeamManager | null;
  normalizeAgentType: (agentType: string) => string;
  sendToRenderer: (channel: string, data: unknown) => void;
  getMessageIds: () => { textId: string | null; thinkingId: string | null };
  setMessageIds: (textId: string | null, thinkingId: string | null) => void;
  clearTranscriptAccumulator: (agentId: string) => void;
  /** Whether to route leader messages to TeamManager (default: false for backward compatibility) */
  routeLeaderToTeam?: boolean;
}

/**
 * Setup Claude service with all event handlers
 *
 * @param deps - External dependencies
 * @returns Configured ClaudeAgentService instance
 */
export function setupClaudeService(deps: ClaudeServiceDependencies): ClaudeAgentService {
  const claudeService = new ClaudeAgentService();

  // Enable SDK-OMC mode (built-in OMC implementation)
  claudeService.enableSdkOmc();
  console.log('[ClaudeServiceSetup] SDK-OMC enabled');

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
    console.log(
      '[ClaudeServiceSetup] Agent started:',
      event.agentType,
      '->',
      normalizedRole,
      event.agentId,
      'toolUseId:',
      event.toolUseId || 'none'
    );

    // Check if StreamRouter already has this agent
    if (deps.streamRouter?.hasAgent(event.agentId)) {
      console.log('[ClaudeServiceSetup] Agent already tracked');
      return;
    }

    // Push context to StreamRouter (creates widget)
    await deps.streamRouter?.pushContext(
      event.agentId,
      event.agentType,
      false,
      event.toolUseId,
      event.transcriptAgentId
    );

    // Start watching transcript for this agent
    if (deps.transcriptWatcher) {
      console.log('[ClaudeServiceSetup] Starting transcript watcher:', event.agentId);
      deps.transcriptWatcher.startWatching(event.agentId);
    }

    // Notify renderer
    deps.sendToRenderer('team:agent-joined', { agentId: event.agentId, role: normalizedRole });
  });

  // Auto-detect agent stops from SDK hooks
  claudeService.on('agentStop', (event: AgentStopEvent) => {
    console.log('[ClaudeServiceSetup] Agent stopped:', event.agentId);

    // Stop watching transcript
    if (deps.transcriptWatcher) {
      deps.transcriptWatcher.stopWatching(event.agentId);
    }

    // Clear transcript accumulator
    deps.clearTranscriptAccumulator(event.agentId);

    // Pop context from StreamRouter
    const context = deps.streamRouter?.popContext(event.agentId);

    if (context) {
      deps.sendToRenderer('team:agent-completed', {
        agentId: event.agentId,
        role: context.normalizedRole,
      });
    }
  });

  // Handle available agents list
  claudeService.on('agentsAvailable', (agents: string[]) => {
    console.log('[ClaudeServiceSetup] Agents available:', agents);
    deps.sendToRenderer('team:agents-available', { agents });
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
 * Per-team leader message state manager
 */
interface LeaderStateManager {
  get(teamId: string): LeaderMessageState;
  reset(teamId: string): void;
  clear(teamId: string): void;
}

function createLeaderStateManager(): LeaderStateManager {
  const states = new Map<string, LeaderMessageState>();

  function createEmptyState(): LeaderMessageState {
    return {
      currentType: null,
      currentMessageId: null,
      accumulatedContent: '',
    };
  }

  return {
    get(teamId: string): LeaderMessageState {
      let state = states.get(teamId);
      if (!state) {
        state = createEmptyState();
        states.set(teamId, state);
      }
      return state;
    },
    reset(teamId: string): void {
      const state = states.get(teamId);
      if (state) {
        state.currentType = null;
        state.currentMessageId = null;
        state.accumulatedContent = '';
      }
    },
    clear(teamId: string): void {
      states.delete(teamId);
    },
  };
}

/**
 * Setup message event handlers with routing logic
 */
function setupMessageHandlers(
  claudeService: ClaudeAgentService,
  deps: ClaudeServiceDependencies
): void {
  // Per-team leader message state manager (replaces single shared state)
  const leaderStateManager = createLeaderStateManager();

  claudeService.on('message', (message: ClaudeAgentMessage) => {
    console.log(
      '[ClaudeServiceSetup] Message:',
      message.type,
      'parentToolUseId:',
      message.parentToolUseId || 'none',
      'content length:',
      message.content?.length || 0
    );

    switch (message.type) {
      case 'text':
        handleStreamingMessage('text', message, deps, leaderStateManager);
        break;
      case 'thinking':
        handleStreamingMessage('thinking', message, deps, leaderStateManager);
        break;
      case 'tool_use':
        handleToolUseMessage(message, deps, leaderStateManager);
        break;
      case 'result':
        handleResultMessage(message, deps, leaderStateManager);
        break;
      case 'error':
        handleErrorMessage(message, deps, leaderStateManager);
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
  leaderStateManager: LeaderStateManager
): void {
  const ids = deps.getMessageIds();
  if (messageType === 'text') {
    const newTextId = ids.textId || `text-${Date.now()}`;
    deps.setMessageIds(newTextId, ids.thinkingId);
    deps.sendToRenderer('agent:status', { status: 'responding' as AgentStatus });
    deps.sendToRenderer('agent:message', {
      messageId: newTextId,
      chunk: message.content,
      fullText: message.content,
      type: 'text',
      isComplete: false,
    });
  } else {
    const newThinkingId = ids.thinkingId || `thinking-${Date.now()}`;
    deps.setMessageIds(ids.textId, newThinkingId);
    deps.sendToRenderer('agent:status', { status: 'thinking' as AgentStatus });
    deps.sendToRenderer('agent:message', {
      messageId: newThinkingId,
      chunk: message.content,
      fullText: message.content,
      type: 'thinking',
      isComplete: false,
    });
  }

  // Route leader messages (no parentToolUseId) to TeamManager with accumulation
  if (deps.routeLeaderToTeam && !message.parentToolUseId && deps.teamManager) {
    const activeTeam = deps.teamManager.getActiveTeam();
    if (activeTeam) {
      const leaderState = leaderStateManager.get(activeTeam.id);

      // Skip if content equals accumulated (this is the final complete message)
      if (leaderState.accumulatedContent === message.content) {
        console.log(`[ClaudeServiceSetup] Skipping duplicate final ${messageType} message`);
        return;
      }

      // Check if type changed -> new message bubble
      if (leaderState.currentType !== messageType) {
        const msgId = `leader-${messageType}-${Date.now()}`;
        leaderState.currentType = messageType;
        leaderState.currentMessageId = msgId;
        leaderState.accumulatedContent = message.content;

        deps.teamManager.addAgentMessage(activeTeam.id, activeTeam.leaderId, {
          id: msgId,
          type: messageType,
          content: message.content,
          timestamp: Date.now(),
          isStreaming: true,
        });
      } else {
        // Same type, accumulate content
        leaderState.accumulatedContent += message.content;

        if (leaderState.currentMessageId) {
          deps.teamManager.updateLastAgentMessage(
            activeTeam.id,
            activeTeam.leaderId,
            leaderState.accumulatedContent
          );
        }
      }
    }
  }
}

/**
 * Handle tool use messages
 */
function handleToolUseMessage(
  message: ClaudeAgentMessage,
  deps: ClaudeServiceDependencies,
  leaderStateManager: LeaderStateManager
): void {
  // Reset message IDs
  deps.setMessageIds(null, null);

  // Reset leader state for active team (tool use interrupts text/thinking flow)
  if (deps.teamManager) {
    const activeTeam = deps.teamManager.getActiveTeam();
    if (activeTeam) {
      leaderStateManager.reset(activeTeam.id);
    }
  }

  deps.sendToRenderer('agent:status', { status: 'using_tool' as AgentStatus });
  deps.sendToRenderer('agent:tool-use', {
    toolName: message.toolName || 'Unknown',
    input: message.toolInput || '',
  });

  // Route leader tool_use messages (no parentToolUseId) to TeamManager
  if (deps.routeLeaderToTeam && !message.parentToolUseId && deps.teamManager) {
    const activeTeam = deps.teamManager.getActiveTeam();
    if (activeTeam) {
      const msgId = `leader-tool-${Date.now()}`;
      const toolContent = message.toolInput
        ? `${message.toolName || 'Tool'}\n${message.toolInput}`
        : message.toolName || 'Tool';

      deps.teamManager.addAgentMessage(activeTeam.id, activeTeam.leaderId, {
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
  leaderStateManager: LeaderStateManager
): void {
  // Reset message IDs
  deps.setMessageIds(null, null);

  // Reset leader state for active team
  if (deps.teamManager) {
    const activeTeam = deps.teamManager.getActiveTeam();
    if (activeTeam) {
      leaderStateManager.reset(activeTeam.id);
    }
  }

  deps.sendToRenderer('agent:status', { status: 'complete' as AgentStatus });
  deps.sendToRenderer('agent:result', {
    result: message.content,
    costUsd: message.costUsd || 0,
    turns: message.turns || 0,
  });

  // Route leader result messages (no parentToolUseId) to TeamManager
  if (deps.routeLeaderToTeam && !message.parentToolUseId && deps.teamManager) {
    const activeTeam = deps.teamManager.getActiveTeam();
    if (activeTeam) {
      const msgId = `leader-result-${Date.now()}`;
      const resultContent = message.costUsd !== undefined
        ? `${message.content}\n\n💰 Cost: $${message.costUsd.toFixed(4)} | Turns: ${message.turns || 0}`
        : message.content;

      deps.teamManager.addAgentMessage(activeTeam.id, activeTeam.leaderId, {
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
  leaderStateManager: LeaderStateManager
): void {
  // Reset message IDs
  deps.setMessageIds(null, null);

  // Reset leader state for active team
  if (deps.teamManager) {
    const activeTeam = deps.teamManager.getActiveTeam();
    if (activeTeam) {
      leaderStateManager.reset(activeTeam.id);
    }
  }

  deps.sendToRenderer('agent:status', { status: 'error' as AgentStatus });
  deps.sendToRenderer('agent:error', { error: message.content });

  // Route leader error messages (no parentToolUseId) to TeamManager
  if (deps.routeLeaderToTeam && !message.parentToolUseId && deps.teamManager) {
    const activeTeam = deps.teamManager.getActiveTeam();
    if (activeTeam) {
      const msgId = `leader-error-${Date.now()}`;

      deps.teamManager.addAgentMessage(activeTeam.id, activeTeam.leaderId, {
        id: msgId,
        type: 'error',
        content: message.content,
        timestamp: Date.now(),
        isStreaming: false,
      });
    }
  }
}

