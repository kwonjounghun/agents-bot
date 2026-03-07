/**
 * Message Router Service
 *
 * Routes Claude Agent messages to appropriate widgets and renderer.
 * Single responsibility: message routing and distribution.
 */

import type { ClaudeAgentMessage } from '../claudeAgentService';
import type { StreamRouter } from './streamRouter';
import type { WidgetManager } from '../widgetManager';
import type { LeaderAgentManager } from '../leaderAgentManager';
import type { AgentStatus } from '../../shared/types';

export interface MessageRouterConfig {
  streamRouter: StreamRouter;
  widgetManager: WidgetManager;
  leaderManager: LeaderAgentManager | null;
  sendToRenderer: (channel: string, data: unknown) => void;
}

export interface MessageIdState {
  textMessageId: string | null;
  thinkingMessageId: string | null;
}

/**
 * Message Router Service
 *
 * Routes messages from Claude Agent SDK to appropriate destinations.
 */
export class MessageRouterService {
  private config: MessageRouterConfig;
  private messageIdState: MessageIdState;

  constructor(config: MessageRouterConfig) {
    this.config = config;
    this.messageIdState = {
      textMessageId: null,
      thinkingMessageId: null
    };
  }

  /**
   * Reset message IDs (call on new conversation)
   */
  resetMessageIds(): void {
    this.messageIdState.textMessageId = null;
    this.messageIdState.thinkingMessageId = null;
  }

  /**
   * Get current message ID state
   */
  getMessageIdState(): MessageIdState {
    return { ...this.messageIdState };
  }

  /**
   * Update leader manager reference
   */
  setLeaderManager(leaderManager: LeaderAgentManager | null): void {
    this.config.leaderManager = leaderManager;
  }

  /**
   * Handle incoming message and route appropriately
   */
  handleMessage(message: ClaudeAgentMessage): void {
    const { streamRouter, leaderManager, sendToRenderer } = this.config;

    console.log('[MessageRouter] Message received:', message.type,
      'parentToolUseId:', message.parentToolUseId || 'none',
      'content length:', message.content?.length || 0);

    switch (message.type) {
      case 'text':
        this.routeTextMessage(message);
        break;

      case 'thinking':
        this.routeThinkingMessage(message);
        break;

      case 'tool_use':
        this.routeToolUseMessage(message);
        break;

      case 'result':
        this.routeResultMessage(message);
        break;

      case 'error':
        this.routeErrorMessage(message);
        break;
    }
  }

  /**
   * Route text message
   */
  private routeTextMessage(message: ClaudeAgentMessage): void {
    const { streamRouter, leaderManager, sendToRenderer } = this.config;

    // Create new message ID only if we don't have one yet
    if (!this.messageIdState.textMessageId) {
      this.messageIdState.textMessageId = `text-${Date.now()}`;
    }

    sendToRenderer('agent:status', { status: 'responding' as AgentStatus });
    sendToRenderer('agent:message', {
      messageId: this.messageIdState.textMessageId,
      chunk: message.content,
      fullText: message.content,
      type: 'text',
      isComplete: false
    });

    // Route to leader widget or subagent widget
    if (leaderManager?.hasLeader()) {
      if (message.parentToolUseId) {
        const subAgent = leaderManager.findSubAgentByToolUseId(message.parentToolUseId);
        if (subAgent) {
          leaderManager.updateSubAgentStatus(subAgent.id, 'responding');
          leaderManager.sendSubAgentMessage(subAgent.id, 'speaking', message.content);
        }
      } else {
        leaderManager.sendToLeader('status', { status: 'responding' });
        leaderManager.sendToLeader('message', {
          type: 'speaking',
          content: message.content,
          timestamp: Date.now()
        });
      }
    } else if (message.parentToolUseId) {
      console.log('[MessageRouter] Routing text to subagent via parentToolUseId:', message.parentToolUseId);
      streamRouter?.routeStatusByToolUseId('responding', message.parentToolUseId);
      streamRouter?.routeMessageByToolUseId('speaking', message.content, message.parentToolUseId);
    } else if (streamRouter && streamRouter.getStackDepth() > 0) {
      console.log('[MessageRouter] Routing text to current agent (fallback)');
      streamRouter.routeStatus('responding');
      streamRouter.routeMessage('speaking', message.content);
    }
  }

  /**
   * Route thinking message
   */
  private routeThinkingMessage(message: ClaudeAgentMessage): void {
    const { streamRouter, leaderManager, sendToRenderer } = this.config;

    // Create new message ID only if we don't have one yet
    if (!this.messageIdState.thinkingMessageId) {
      this.messageIdState.thinkingMessageId = `thinking-${Date.now()}`;
    }

    sendToRenderer('agent:status', { status: 'thinking' as AgentStatus });
    sendToRenderer('agent:message', {
      messageId: this.messageIdState.thinkingMessageId,
      chunk: message.content,
      fullText: message.content,
      type: 'thinking',
      isComplete: false
    });

    // Route thinking to leader widget or subagent widget
    if (leaderManager?.hasLeader()) {
      if (message.parentToolUseId) {
        const subAgent = leaderManager.findSubAgentByToolUseId(message.parentToolUseId);
        if (subAgent) {
          leaderManager.updateSubAgentStatus(subAgent.id, 'thinking');
          leaderManager.sendSubAgentMessage(subAgent.id, 'thinking', message.content);
        }
      } else {
        leaderManager.sendToLeader('status', { status: 'thinking' });
        leaderManager.sendToLeader('message', {
          type: 'thinking',
          content: message.content,
          timestamp: Date.now()
        });
      }
    } else if (message.parentToolUseId) {
      console.log('[MessageRouter] Routing thinking to subagent via parentToolUseId:', message.parentToolUseId);
      streamRouter?.routeStatusByToolUseId('thinking', message.parentToolUseId);
      streamRouter?.routeMessageByToolUseId('thinking', message.content, message.parentToolUseId);
    } else if (streamRouter && streamRouter.getStackDepth() > 0) {
      console.log('[MessageRouter] Routing thinking to current agent (fallback)');
      streamRouter.routeStatus('thinking');
      streamRouter.routeMessage('thinking', message.content);
    }
  }

  /**
   * Route tool_use message
   */
  private routeToolUseMessage(message: ClaudeAgentMessage): void {
    const { streamRouter, sendToRenderer } = this.config;

    // Tool use resets text message for next response
    this.messageIdState.textMessageId = null;
    this.messageIdState.thinkingMessageId = null;

    sendToRenderer('agent:status', { status: 'using_tool' as AgentStatus });
    sendToRenderer('agent:tool-use', {
      toolName: message.toolName || 'Unknown',
      input: message.toolInput || ''
    });

    // Build tool message for widget
    const toolMessage = this.formatToolMessage(message);

    // Route tool use to subagent widget
    if (message.parentToolUseId) {
      streamRouter?.routeStatusByToolUseId('using_tool', message.parentToolUseId);
      streamRouter?.routeMessageByToolUseId('tool_use', toolMessage, message.parentToolUseId);
    } else if (streamRouter && streamRouter.getStackDepth() > 0) {
      streamRouter.routeStatus('using_tool');
      streamRouter.routeMessage('tool_use', toolMessage);
    }
  }

  /**
   * Route result message
   */
  private routeResultMessage(message: ClaudeAgentMessage): void {
    const { streamRouter, leaderManager, sendToRenderer } = this.config;

    // Reset all message IDs on completion
    this.messageIdState.textMessageId = null;
    this.messageIdState.thinkingMessageId = null;

    sendToRenderer('agent:status', { status: 'complete' as AgentStatus });
    sendToRenderer('agent:result', {
      result: message.content,
      costUsd: message.costUsd || 0,
      turns: message.turns || 0
    });

    // Route completion to leader widget or StreamRouter
    if (leaderManager?.hasLeader()) {
      leaderManager.sendToLeader('status', { status: 'complete' });
      leaderManager.sendToLeader('result', {
        result: message.content,
        costUsd: message.costUsd || 0,
        turns: message.turns || 0
      });
      leaderManager.sendToLeader('message', {
        type: 'complete',
        content: message.content,
        timestamp: Date.now()
      });
    } else if (streamRouter && streamRouter.getStackDepth() > 0) {
      streamRouter.broadcastStatus('complete');
      streamRouter.broadcastMessage('complete', '');
    }
  }

  /**
   * Route error message
   */
  private routeErrorMessage(message: ClaudeAgentMessage): void {
    const { streamRouter, leaderManager, sendToRenderer } = this.config;

    // Reset all message IDs on error
    this.messageIdState.textMessageId = null;
    this.messageIdState.thinkingMessageId = null;

    sendToRenderer('agent:status', { status: 'error' as AgentStatus });
    sendToRenderer('agent:error', { error: message.content });

    // Route error to leader widget or subagent widget
    if (leaderManager?.hasLeader()) {
      if (message.parentToolUseId) {
        const subAgent = leaderManager.findSubAgentByToolUseId(message.parentToolUseId);
        if (subAgent) {
          leaderManager.updateSubAgentStatus(subAgent.id, 'error');
          leaderManager.sendSubAgentMessage(subAgent.id, 'speaking', `Error: ${message.content}`);
        }
      } else {
        leaderManager.sendToLeader('status', { status: 'error' });
        leaderManager.sendToLeader('error', { error: message.content });
      }
    } else if (message.parentToolUseId) {
      streamRouter?.routeStatusByToolUseId('error', message.parentToolUseId);
      streamRouter?.routeMessageByToolUseId('speaking', `Error: ${message.content}`, message.parentToolUseId);
    } else if (streamRouter && streamRouter.getStackDepth() > 0) {
      streamRouter.routeError(message.content);
    }
  }

  /**
   * Format tool message for display
   */
  private formatToolMessage(message: ClaudeAgentMessage): string {
    const toolName = message.toolName || 'tool';
    let toolDetail = '';

    if (message.toolInput) {
      try {
        const input = JSON.parse(message.toolInput);
        if (toolName === 'Read' && input.file_path) {
          toolDetail = ` ${input.file_path.split('/').pop()}`;
        } else if (toolName === 'Glob' && input.pattern) {
          toolDetail = ` ${input.pattern}`;
        } else if (toolName === 'Grep' && input.pattern) {
          toolDetail = ` "${input.pattern.substring(0, 20)}"`;
        } else if (toolName === 'Edit' && input.file_path) {
          toolDetail = ` ${input.file_path.split('/').pop()}`;
        } else if (toolName === 'Write' && input.file_path) {
          toolDetail = ` ${input.file_path.split('/').pop()}`;
        } else if (toolName === 'Bash' && input.command) {
          const cmd = input.command.split(' ')[0];
          toolDetail = ` ${cmd}`;
        }
      } catch {
        // Ignore JSON parse errors
      }
    }

    return `${toolName}${toolDetail}`;
  }
}

/**
 * Create a message router service instance
 */
export function createMessageRouterService(config: MessageRouterConfig): MessageRouterService {
  return new MessageRouterService(config);
}
