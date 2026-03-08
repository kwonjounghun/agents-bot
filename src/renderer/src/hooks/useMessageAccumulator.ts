/**
 * useMessageAccumulator Hook
 *
 * Shared hook for accumulating messages into sections.
 * Used by both Widget.tsx and LeaderWidget.tsx.
 *
 * Key feature: Messages accumulate and never replace -
 * text keeps growing within each section until a new section starts.
 */

import { useState, useRef, useCallback } from 'react';
import type { SpeechMessage } from '../../../shared/types';

/**
 * Generic message type that can be used by both Widget and LeaderWidget
 */
export interface IncomingMessage {
  type: 'thinking' | 'speaking' | 'tool_use' | 'tool_result' | 'complete' | 'error';
  content: string;
  timestamp?: number;
  sectionId?: string;
  isNewSection?: boolean;
  toolName?: string;
}

/**
 * Return type for the useMessageAccumulator hook
 */
export interface UseMessageAccumulatorReturn {
  /** Current list of accumulated messages */
  messages: SpeechMessage[];
  /** Whether streaming is currently active */
  isStreaming: boolean;
  /** Handle incoming message - accumulates into sections */
  handleMessage: (message: IncomingMessage) => void;
  /** Mark the current section as complete */
  handleComplete: () => void;
  /** Clear all messages and reset state */
  clearMessages: () => void;
  /** Reference to track current section (for external access if needed) */
  currentSectionRef: React.MutableRefObject<{ id: string; type: string } | null>;
}

/**
 * Generate a unique section ID
 */
function generateSectionId(): string {
  return `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Map incoming message type to SpeechMessage type
 */
function mapMessageType(type: IncomingMessage['type']): SpeechMessage['type'] {
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

/**
 * Hook for accumulating messages into sections
 *
 * @example
 * ```tsx
 * const { messages, isStreaming, handleMessage, clearMessages } = useMessageAccumulator();
 *
 * // In message subscription
 * window.widgetAPI?.onMessage((msg) => {
 *   if (msg.type === 'complete') {
 *     handleComplete();
 *   } else {
 *     handleMessage(msg);
 *   }
 * });
 * ```
 */
export function useMessageAccumulator(): UseMessageAccumulatorReturn {
  const [messages, setMessages] = useState<SpeechMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const currentSectionRef = useRef<{ id: string; type: string } | null>(null);

  /**
   * Mark the last section as complete and stop streaming
   */
  const handleComplete = useCallback(() => {
    setMessages(prev => {
      if (prev.length === 0) return prev;
      return prev.map((m, i) =>
        i === prev.length - 1 ? { ...m, isComplete: true } : m
      );
    });
    setIsStreaming(false);
    currentSectionRef.current = null;
  }, []);

  /**
   * Handle incoming message - accumulate into sections
   */
  const handleMessage = useCallback((message: IncomingMessage) => {
    // Handle complete type
    if (message.type === 'complete') {
      handleComplete();
      return;
    }

    // Skip error type (handled separately by components)
    if (message.type === 'error') {
      return;
    }

    const msgType = mapMessageType(message.type);

    setMessages(prev => {
      const currentSection = currentSectionRef.current;

      // Check if this is a new section or continuation
      const isNewSection = message.isNewSection ||
        !currentSection ||
        currentSection.type !== msgType;

      if (isNewSection) {
        // Mark previous section as complete
        const updatedPrev = prev.length > 0
          ? prev.map((m, i) =>
              i === prev.length - 1 ? { ...m, isComplete: true } : m
            )
          : prev;

        // Create new section
        const newSectionId = message.sectionId || generateSectionId();
        currentSectionRef.current = { id: newSectionId, type: msgType };

        return [...updatedPrev, {
          id: newSectionId,
          type: msgType,
          content: message.content,
          timestamp: Date.now(),
          isComplete: false
        }];
      } else {
        // Update existing section (content is already accumulated by TranscriptWatcher)
        return prev.map((m, i) =>
          i === prev.length - 1
            ? { ...m, content: message.content }
            : m
        );
      }
    });

    setIsStreaming(true);
  }, [handleComplete]);

  /**
   * Clear all messages and reset state
   */
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
    clearMessages,
    currentSectionRef
  };
}

export default useMessageAccumulator;
