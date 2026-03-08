/**
 * useLeaderDataSource Hook
 *
 * SDK Layer for leader (parent agent) widgets.
 * Wraps window.leaderAPI IPC subscriptions.
 *
 * Data source: SDK stream directly from ClaudeAgentService
 */

import { useEffect } from 'react';
import type { LeaderParams, LeaderDataHandlers, LeaderMessage, SubAgentStatusUpdate, LeaderResult } from './types';
import type { AgentStatus, IncomingMessage, AgentRole } from '../../shared';

/**
 * Get leader parameters from URL
 */
export function getLeaderParams(): LeaderParams {
  const params = window.leaderAPI?.getLeaderParams();
  return {
    leaderId: params?.leaderId || '',
    workingDirectory: params?.workingDirectory || ''
  };
}

/**
 * Subscribe to leader data events
 *
 * @param handlers - Event handlers for all leader events
 * @returns Cleanup function to unsubscribe
 */
export function subscribeToLeaderData(handlers: LeaderDataHandlers): () => void {
  const cleanupFns: (() => void)[] = [];

  // Message subscription - data comes from SDK stream
  const unsubMessage = window.leaderAPI?.onMessage((message: LeaderMessage) => {
    const incomingMessage: IncomingMessage = {
      type: message.type,
      content: message.content,
      timestamp: message.timestamp
    };
    handlers.onMessage(incomingMessage);
  });
  if (unsubMessage) cleanupFns.push(unsubMessage);

  // Status subscription
  const unsubStatus = window.leaderAPI?.onStatus((status: AgentStatus) => {
    handlers.onStatus(status);
  });
  if (unsubStatus) cleanupFns.push(unsubStatus);

  // Sub-agent status subscription
  const unsubSubAgentStatus = window.leaderAPI?.onSubAgentStatus((data: SubAgentStatusUpdate) => {
    handlers.onSubAgentStatus(data);
  });
  if (unsubSubAgentStatus) cleanupFns.push(unsubSubAgentStatus);

  // Sub-agent created subscription
  const unsubSubAgentCreated = window.leaderAPI?.onSubAgentCreated((data: { agentId: string; role: AgentRole }) => {
    handlers.onSubAgentCreated(data);
  });
  if (unsubSubAgentCreated) cleanupFns.push(unsubSubAgentCreated);

  // Sub-agent removed subscription
  const unsubSubAgentRemoved = window.leaderAPI?.onSubAgentRemoved((data: { agentId: string }) => {
    handlers.onSubAgentRemoved(data);
  });
  if (unsubSubAgentRemoved) cleanupFns.push(unsubSubAgentRemoved);

  // Result subscription
  const unsubResult = window.leaderAPI?.onResult((data: LeaderResult) => {
    handlers.onResult(data);
  });
  if (unsubResult) cleanupFns.push(unsubResult);

  // Error subscription
  const unsubError = window.leaderAPI?.onError((error: string) => {
    handlers.onError(error);
  });
  if (unsubError) cleanupFns.push(unsubError);

  // Return cleanup function
  return () => {
    cleanupFns.forEach((fn) => fn());
  };
}

/**
 * Hook for leader data source subscription
 *
 * Manages IPC subscriptions lifecycle with React's useEffect.
 * Data is received from SDK stream directly.
 */
export function useLeaderDataSource(handlers: LeaderDataHandlers): LeaderParams {
  const params = getLeaderParams();

  useEffect(() => {
    // Notify main process that leader is ready
    window.leaderAPI?.notifyReady();

    const cleanup = subscribeToLeaderData(handlers);
    return cleanup;
  }, [handlers]);

  return params;
}

export default useLeaderDataSource;
