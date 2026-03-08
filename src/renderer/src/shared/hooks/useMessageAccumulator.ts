/**
 * useMessageAccumulator Hook (Shared)
 *
 * Core message accumulation logic, agnostic to data source.
 * Used by both sub-agent and parent agent widgets.
 *
 * Key feature: Messages accumulate into sections - text grows within
 * each section until a new section (different type) starts.
 */

import { useState, useRef, useCallback } from 'react';
import type { SpeechMessage, IncomingMessage, WidgetMessageType } from '../types';
import { generateSectionId } from '../utils';

/**
 * Map incoming message type to speech message type
 */
function mapToSpeechType(type: WidgetMessageType): SpeechMessage['type'] {
  switch (type) {
    case 'thinking':
      return 'thinking';
    case 'tool_use':
      return 'tool_use';
    case 'tool_result':
      return 'tool_result';
    case 'speaking':
    default:
      return 'speaking';
  }
}

export interface UseMessageAccumulatorReturn {
  /** Accumulated messages as sections */
  messages: SpeechMessage[];
  /** Whether streaming is active */
  isStreaming: boolean;
  /** Handle incoming message */
  handleMessage: (message: IncomingMessage) => void;
  /** Mark current section as complete */
  handleComplete: () => void;
  /** Clear all messages */
  clearMessages: () => void;
}

/**
 * Hook for accumulating messages into sections
 */
export function useMessageAccumulator(): UseMessageAccumulatorReturn {
  const [messages, setMessages] = useState<SpeechMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const currentSectionRef = useRef<{ id: string; type: string } | null>(null);

  const handleComplete = useCallback(() => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      return prev.map((m, i) => (i === prev.length - 1 ? { ...m, isComplete: true } : m));
    });
    setIsStreaming(false);
    currentSectionRef.current = null;
  }, []);

  const handleMessage = useCallback(
    (message: IncomingMessage) => {
      // Handle complete/error types
      if (message.type === 'complete') {
        handleComplete();
        return;
      }

      if (message.type === 'error') {
        return; // Handled separately by components
      }

      const msgType = mapToSpeechType(message.type);

      setMessages((prev) => {
        const currentSection = currentSectionRef.current;
        const isNewSection = message.isNewSection || !currentSection || currentSection.type !== msgType;

        if (isNewSection) {
          // Mark previous section as complete
          const updatedPrev =
            prev.length > 0
              ? prev.map((m, i) => (i === prev.length - 1 ? { ...m, isComplete: true } : m))
              : prev;

          // Create new section
          const newSectionId = message.sectionId || generateSectionId();
          currentSectionRef.current = { id: newSectionId, type: msgType };

          return [
            ...updatedPrev,
            {
              id: newSectionId,
              type: msgType,
              content: message.content,
              timestamp: Date.now(),
              isComplete: false
            }
          ];
        } else {
          // Update existing section
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: message.content } : m));
        }
      });

      setIsStreaming(true);
    },
    [handleComplete]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setIsStreaming(false);
    currentSectionRef.current = null;
  }, []);

  return {
    messages,
    isStreaming,
    handleMessage,
    handleComplete,
    clearMessages
  };
}

export default useMessageAccumulator;
