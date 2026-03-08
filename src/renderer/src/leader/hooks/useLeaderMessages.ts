/**
 * useLeaderMessages Hook
 *
 * Business Logic Layer for leader message handling.
 * Extends shared useMessageAccumulator with leader-specific behavior.
 */

import { useCallback } from 'react';
import { useMessageAccumulator } from '../../shared';
import type { IncomingMessage } from '../../shared';

export interface UseLeaderMessagesReturn {
  messages: ReturnType<typeof useMessageAccumulator>['messages'];
  isStreaming: boolean;
  handleMessage: (message: IncomingMessage) => void;
  handleComplete: () => void;
  clearMessages: () => void;
}

/**
 * Hook for leader message handling
 */
export function useLeaderMessages(): UseLeaderMessagesReturn {
  const { messages, isStreaming, handleMessage: baseHandleMessage, handleComplete, clearMessages } =
    useMessageAccumulator();

  /**
   * Handle incoming message with leader-specific logic
   */
  const handleMessage = useCallback(
    (message: IncomingMessage) => {
      // Handle complete type
      if (message.type === 'complete') {
        handleComplete();
        return;
      }

      // Error type is handled by state management, not messages
      if (message.type === 'error') {
        return;
      }

      baseHandleMessage(message);
    },
    [baseHandleMessage, handleComplete]
  );

  return {
    messages,
    isStreaming,
    handleMessage,
    handleComplete,
    clearMessages
  };
}

export default useLeaderMessages;
