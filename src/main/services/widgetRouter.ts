/**
 * Widget Router Module
 * Single Responsibility: Route messages to widgets
 *
 * This module handles:
 * - Sending messages to the current active widget
 * - Broadcasting messages to all widgets
 * - Updating widget status
 *
 * Usage:
 *   const router = createWidgetRouter(teamStateManager, widgetManager);
 *   router.sendToActive('speaking', 'Hello');
 *   router.sendToAll('thinking', 'Processing...');
 */

import type { TeamStateManager } from './teamStateManager';
import type { AgentRole } from './agentNormalizer';

export type WidgetMessageType = 'thinking' | 'speaking' | 'tool_use' | 'complete';
export type AgentStatus = 'idle' | 'thinking' | 'responding' | 'using_tool' | 'complete' | 'error';

export interface WidgetMessage {
  agentId: string;
  role: AgentRole;
  type: WidgetMessageType;
  content: string;
  timestamp: number;
}

export interface WidgetManagerInterface {
  sendMessageToWidget(message: WidgetMessage): void;
  sendStatusToWidget(agentId: string, status: AgentStatus): void;
}

export interface WidgetRouter {
  /**
   * Send a message to the current active widget.
   */
  sendToActive(type: WidgetMessageType, content: string): void;

  /**
   * Send a message to all widgets.
   */
  sendToAll(type: WidgetMessageType, content: string): void;

  /**
   * Update the status of the current active widget.
   */
  updateActiveStatus(status: AgentStatus): void;

  /**
   * Update the status of all widgets.
   */
  updateAllStatus(status: AgentStatus): void;

  /**
   * Check if there are any active widgets.
   */
  hasActiveWidgets(): boolean;
}

/**
 * Create a new widget router.
 *
 * @param teamStateManager - Team state manager for agent tracking
 * @param widgetManager - Widget manager for sending messages
 * @returns WidgetRouter instance
 */
export function createWidgetRouter(
  teamStateManager: TeamStateManager,
  widgetManager: WidgetManagerInterface | null
): WidgetRouter {
  return {
    sendToActive(type: WidgetMessageType, content: string): void {
      const agent = teamStateManager.getCurrentAgent();
      if (!agent || !widgetManager) {
        return;
      }

      const message: WidgetMessage = {
        agentId: agent.id,
        role: agent.role,
        type,
        content,
        timestamp: Date.now()
      };

      widgetManager.sendMessageToWidget(message);
    },

    sendToAll(type: WidgetMessageType, content: string): void {
      if (!widgetManager) {
        return;
      }

      const agents = teamStateManager.getAllAgents();

      for (const agent of agents) {
        const message: WidgetMessage = {
          agentId: agent.id,
          role: agent.role,
          type,
          content,
          timestamp: Date.now()
        };

        widgetManager.sendMessageToWidget(message);
      }
    },

    updateActiveStatus(status: AgentStatus): void {
      const agent = teamStateManager.getCurrentAgent();
      if (!agent || !widgetManager) {
        return;
      }

      widgetManager.sendStatusToWidget(agent.id, status);
    },

    updateAllStatus(status: AgentStatus): void {
      if (!widgetManager) {
        return;
      }

      const agents = teamStateManager.getAllAgents();

      for (const agent of agents) {
        widgetManager.sendStatusToWidget(agent.id, status);
      }
    },

    hasActiveWidgets(): boolean {
      return teamStateManager.getAgentCount() > 0;
    }
  };
}
