/**
 * useSubagentDataSource Hook
 *
 * SDK Layer for sub-agent widgets.
 * Wraps window.widgetAPI IPC subscriptions.
 *
 * Data source: TranscriptWatcher polling JSONL files (claude-esp style)
 */

import { useEffect, useCallback } from 'react';
import type { SubagentParams, SubagentDataHandlers, SubagentWidgetMessage } from './types';
import type { AgentStatus, IncomingMessage, AgentRole } from '../../shared';

/**
 * Get sub-agent parameters from URL
 */
export function getSubagentParams(): SubagentParams {
  const params = window.widgetAPI?.getWidgetParams();
  return {
    agentId: params?.agentId || '',
    role: (params?.role as AgentRole) || 'executor'
  };
}

/**
 * Subscribe to sub-agent data events
 *
 * @param handlers - Event handlers for message, status, and close events
 * @returns Cleanup function to unsubscribe
 */
export function subscribeToSubagentData(handlers: SubagentDataHandlers): () => void {
  const cleanupFns: (() => void)[] = [];

  console.log('[useSubagentDataSource] subscribeToSubagentData called, widgetAPI:', !!window.widgetAPI);

  // Message subscription - data comes from TranscriptWatcher polling
  const unsubMessage = window.widgetAPI?.onMessage((message: SubagentWidgetMessage) => {
    console.log('[useSubagentDataSource] IPC message received:', {
      type: message.type,
      contentLength: message.content?.length || 0,
      agentId: message.agentId
    });

    const incomingMessage: IncomingMessage = {
      type: message.type,
      content: message.content,
      timestamp: message.timestamp,
      sectionId: message.sectionId,
      isNewSection: message.isNewSection
    };
    handlers.onMessage(incomingMessage);
  });
  console.log('[useSubagentDataSource] Message subscription set up:', !!unsubMessage);
  if (unsubMessage) cleanupFns.push(unsubMessage);

  // Status subscription
  const unsubStatus = window.widgetAPI?.onStatus((data: { agentId: string; status: AgentStatus }) => {
    handlers.onStatus(data.status);
  });
  if (unsubStatus) cleanupFns.push(unsubStatus);

  // Close subscription
  const unsubClose = window.widgetAPI?.onClose(() => {
    handlers.onClose();
  });
  if (unsubClose) cleanupFns.push(unsubClose);

  // Return cleanup function
  return () => {
    cleanupFns.forEach((fn) => fn());
  };
}

/**
 * Hook for sub-agent data source subscription
 *
 * Manages IPC subscriptions lifecycle with React's useEffect.
 * Data is received from TranscriptWatcher which polls JSONL files.
 */
export function useSubagentDataSource(handlers: SubagentDataHandlers): SubagentParams {
  const params = getSubagentParams();

  console.log('[useSubagentDataSource] Hook called, params:', params);

  useEffect(() => {
    console.log('[useSubagentDataSource] useEffect running, setting up subscriptions');
    const cleanup = subscribeToSubagentData(handlers);
    return () => {
      console.log('[useSubagentDataSource] useEffect cleanup');
      cleanup();
    };
  }, [handlers]);

  return params;
}

export default useSubagentDataSource;
