/**
 * useSubagentMessages Hook
 *
 * Business Logic Layer for sub-agent message handling.
 * Extends shared useMessageAccumulator with sub-agent specific behavior.
 *
 * Key feature: Auto-clear messages after idle status (2s delay)
 */

import { useRef, useCallback } from 'react';
import { useMessageAccumulator } from '../../shared';
import type { IncomingMessage, AgentStatus } from '../../shared';

export interface UseSubagentMessagesReturn {
  messages: ReturnType<typeof useMessageAccumulator>['messages'];
  isStreaming: boolean;
  handleMessage: (message: IncomingMessage) => void;
  handleStatusChange: (status: AgentStatus) => void;
  clearMessages: () => void;
}

/**
 * Hook for sub-agent message handling with auto-clear on idle
 */
export function useSubagentMessages(): UseSubagentMessagesReturn {
  const { messages, isStreaming, handleMessage, handleComplete, clearMessages } = useMessageAccumulator();

  // Track reset timeout to prevent memory leak
  const resetTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Handle status change with auto-clear on idle
   */
  const handleStatusChange = useCallback(
    (status: AgentStatus) => {
      // Clear any existing timeout
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
        resetTimeoutRef.current = null;
      }

      if (status === 'idle') {
        // Reset after delay to show last message
        resetTimeoutRef.current = setTimeout(() => {
          clearMessages();
          resetTimeoutRef.current = null;
        }, 2000);
      }

      if (status === 'complete' || status === 'error') {
        handleComplete();
      }
    },
    [clearMessages, handleComplete]
  );

  /**
   * Clean up timeout on unmount
   */
  const handleClear = useCallback(() => {
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
    clearMessages();
  }, [clearMessages]);

  return {
    messages,
    isStreaming,
    handleMessage,
    handleStatusChange,
    clearMessages: handleClear
  };
}

export default useSubagentMessages;
