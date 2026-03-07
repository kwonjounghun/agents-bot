/**
 * useEventSubscriptions Hook
 * Single Responsibility: Manage IPC event subscriptions
 *
 * This hook centralizes all event subscriptions from the main process
 * and ensures proper cleanup on unmount.
 *
 * Usage:
 *   useEventSubscriptions({
 *     onMessage: (data) => handleMessage(data),
 *     onStatus: (status) => setStatus(status),
 *     // ...other handlers
 *   });
 */

import { useEffect } from 'react';
import type { AgentStatus, MessageType, AgentRole } from '../../../shared/types';

export interface MessageData {
  messageId: string;
  chunk: string;
  fullText: string;
  type: MessageType;
  isComplete: boolean;
}

export interface ToolUseData {
  toolName: string;
  input: string;
}

export interface ResultData {
  result: string;
  costUsd: number;
  turns: number;
}

export interface AgentJoinedData {
  agentId: string;
  role: AgentRole;
}

export interface AgentCompletedData {
  agentId: string;
  role: AgentRole;
}

export interface EventSubscriptionOptions {
  /**
   * Called when a message chunk is received.
   */
  onMessage?: (data: MessageData) => void;

  /**
   * Called when the agent status changes.
   */
  onStatus?: (data: { status: AgentStatus }) => void;

  /**
   * Called when a tool is being used.
   */
  onToolUse?: (data: ToolUseData) => void;

  /**
   * Called when an error occurs.
   */
  onError?: (data: { error: string }) => void;

  /**
   * Called when the query completes with results.
   */
  onResult?: (data: ResultData) => void;

  /**
   * Called when an agent joins the team.
   */
  onAgentJoined?: (data: AgentJoinedData) => void;

  /**
   * Called when an agent completes its work.
   */
  onAgentCompleted?: (data: AgentCompletedData) => void;
}

/**
 * Hook for managing IPC event subscriptions.
 * Automatically subscribes on mount and unsubscribes on unmount.
 *
 * @param options - Event handler callbacks
 */
export function useEventSubscriptions(options: EventSubscriptionOptions): void {
  useEffect(() => {
    const unsubscribers: Array<(() => void) | undefined> = [];

    // Subscribe to message events
    if (options.onMessage) {
      const unsub = window.claudeAPI?.onMessage(options.onMessage);
      unsubscribers.push(unsub);
    }

    // Subscribe to status events
    if (options.onStatus) {
      const unsub = window.claudeAPI?.onStatus(options.onStatus);
      unsubscribers.push(unsub);
    }

    // Subscribe to tool use events
    if (options.onToolUse) {
      const unsub = window.claudeAPI?.onToolUse(options.onToolUse);
      unsubscribers.push(unsub);
    }

    // Subscribe to error events
    if (options.onError) {
      const unsub = window.claudeAPI?.onError(options.onError);
      unsubscribers.push(unsub);
    }

    // Subscribe to result events
    if (options.onResult) {
      const unsub = window.claudeAPI?.onResult(options.onResult);
      unsubscribers.push(unsub);
    }

    // Subscribe to agent joined events
    if (options.onAgentJoined) {
      const unsub = window.claudeAPI?.onAgentJoined(options.onAgentJoined);
      unsubscribers.push(unsub);
    }

    // Subscribe to agent completed events
    if (options.onAgentCompleted) {
      const unsub = window.claudeAPI?.onAgentCompleted(options.onAgentCompleted);
      unsubscribers.push(unsub);
    }

    // Cleanup: unsubscribe from all events
    return () => {
      unsubscribers.forEach(unsub => unsub?.());
    };
  }, [
    options.onMessage,
    options.onStatus,
    options.onToolUse,
    options.onError,
    options.onResult,
    options.onAgentJoined,
    options.onAgentCompleted
  ]);
}
