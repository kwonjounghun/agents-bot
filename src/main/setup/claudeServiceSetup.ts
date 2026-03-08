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
 * Setup message event handlers with routing logic
 */
function setupMessageHandlers(
  claudeService: ClaudeAgentService,
  deps: ClaudeServiceDependencies
): void {
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
        handleTextMessage(message, deps);
        break;
      case 'thinking':
        handleThinkingMessage(message, deps);
        break;
      case 'tool_use':
        handleToolUseMessage(message, deps);
        break;
      case 'result':
        handleResultMessage(message, deps);
        break;
      case 'error':
        handleErrorMessage(message, deps);
        break;
    }
  });
}

/**
 * Handle text messages
 */
function handleTextMessage(message: ClaudeAgentMessage, deps: ClaudeServiceDependencies): void {
  const { textId } = deps.getMessageIds();
  const newTextId = textId || `text-${Date.now()}`;
  deps.setMessageIds(newTextId, deps.getMessageIds().thinkingId);

  deps.sendToRenderer('agent:status', { status: 'responding' as AgentStatus });
  deps.sendToRenderer('agent:message', {
    messageId: newTextId,
    chunk: message.content,
    fullText: message.content,
    type: 'text',
    isComplete: false,
  });

}

/**
 * Handle thinking messages
 */
function handleThinkingMessage(message: ClaudeAgentMessage, deps: ClaudeServiceDependencies): void {
  const { thinkingId } = deps.getMessageIds();
  const newThinkingId = thinkingId || `thinking-${Date.now()}`;
  deps.setMessageIds(deps.getMessageIds().textId, newThinkingId);

  deps.sendToRenderer('agent:status', { status: 'thinking' as AgentStatus });
  deps.sendToRenderer('agent:message', {
    messageId: newThinkingId,
    chunk: message.content,
    fullText: message.content,
    type: 'thinking',
    isComplete: false,
  });

}

/**
 * Handle tool use messages
 */
function handleToolUseMessage(message: ClaudeAgentMessage, deps: ClaudeServiceDependencies): void {
  // Reset message IDs
  deps.setMessageIds(null, null);

  deps.sendToRenderer('agent:status', { status: 'using_tool' as AgentStatus });
  deps.sendToRenderer('agent:tool-use', {
    toolName: message.toolName || 'Unknown',
    input: message.toolInput || '',
  });

}

/**
 * Handle result messages
 */
function handleResultMessage(message: ClaudeAgentMessage, deps: ClaudeServiceDependencies): void {
  // Reset message IDs
  deps.setMessageIds(null, null);

  deps.sendToRenderer('agent:status', { status: 'complete' as AgentStatus });
  deps.sendToRenderer('agent:result', {
    result: message.content,
    costUsd: message.costUsd || 0,
    turns: message.turns || 0,
  });

}

/**
 * Handle error messages
 */
function handleErrorMessage(message: ClaudeAgentMessage, deps: ClaudeServiceDependencies): void {
  // Reset message IDs
  deps.setMessageIds(null, null);

  deps.sendToRenderer('agent:status', { status: 'error' as AgentStatus });
  deps.sendToRenderer('agent:error', { error: message.content });

}

