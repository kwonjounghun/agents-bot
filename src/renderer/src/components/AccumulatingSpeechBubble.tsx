/**
 * AccumulatingSpeechBubble Component
 *
 * Displays accumulated messages in speech bubbles.
 * Key feature: Text accumulates and never replaces - each section
 * is preserved and new content is added below.
 */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AgentRole, SpeechMessage } from '../../../shared/types';
import { AGENT_CONFIG } from '../../../shared/agentTypes';

interface AccumulatingSpeechBubbleProps {
  role: AgentRole;
  messages: SpeechMessage[];
  isStreaming: boolean;
  maxHeight?: number;
}

export const AccumulatingSpeechBubble: React.FC<AccumulatingSpeechBubbleProps> = ({
  role,
  messages,
  isStreaming,
  maxHeight = 160
}) => {
  const config = AGENT_CONFIG[role];
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserScrolling = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current);
      }
    };
  }, []);

  // Auto-scroll to bottom when new content arrives (unless user is scrolling)
  useEffect(() => {
    if (scrollRef.current && !isUserScrolling.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Handle user scroll - pause auto-scroll temporarily
  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;

      // If user scrolled up, pause auto-scroll
      if (!isAtBottom) {
        isUserScrolling.current = true;
        // Reset after 3 seconds of no scrolling
        if (scrollTimeout.current) {
          clearTimeout(scrollTimeout.current);
        }
        scrollTimeout.current = setTimeout(() => {
          isUserScrolling.current = false;
        }, 3000);
      } else {
        isUserScrolling.current = false;
      }
    }
  };

  const getTypeIcon = (type: SpeechMessage['type']) => {
    switch (type) {
      case 'thinking': return '💭';
      case 'speaking': return '💬';
      case 'tool_use': return '🔧';
      case 'tool_result': return '📤';
      default: return '';
    }
  };

  const getTypeStyle = (type: SpeechMessage['type'], isComplete: boolean) => {
    const baseStyle = isComplete ? 'opacity-80' : '';
    switch (type) {
      case 'thinking':
        return `${baseStyle} border-l-2 border-yellow-500/50 pl-2`;
      case 'speaking':
        return `${baseStyle} border-l-2 pl-2`;
      case 'tool_use':
        return `${baseStyle} border-l-2 border-blue-500/50 pl-2 bg-blue-900/20 rounded-r`;
      case 'tool_result':
        return `${baseStyle} border-l-2 border-green-500/50 pl-2 bg-green-900/20 rounded-r`;
      default:
        return baseStyle;
    }
  };

  if (messages.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 10 }}
      transition={{ duration: 0.2 }}
      className="relative w-full"
    >
      {/* Main bubble container */}
      <div
        className="p-3 rounded-xl border-2 backdrop-blur-sm bg-slate-800/90 border-slate-600/50"
        style={{
          borderColor: `${config.color}40`
        }}
      >
        {/* Scrollable content area */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="text-xs text-white/90 leading-relaxed overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
          style={{ maxHeight }}
        >
          <AnimatePresence mode="sync">
            {messages.map((msg, index) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.15 }}
                className={`
                  ${index > 0 ? 'mt-2 pt-2 border-t border-slate-700/30' : ''}
                  ${getTypeStyle(msg.type, msg.isComplete)}
                `}
                style={{
                  borderLeftColor: msg.type === 'speaking' ? `${config.color}50` : undefined
                }}
              >
                {/* Section header with icon */}
                <div className="flex items-start gap-1.5">
                  <span className="flex-shrink-0 text-sm leading-none mt-0.5">
                    {getTypeIcon(msg.type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="whitespace-pre-wrap break-words">
                      {msg.content}
                    </span>
                    {/* Streaming indicator for the last incomplete message */}
                    {!msg.isComplete && isStreaming && index === messages.length - 1 && (
                      <span className="inline-flex ml-1 items-center">
                        <span
                          className="w-1.5 h-1.5 bg-white/60 rounded-full mx-0.5 animate-bounce"
                          style={{ animationDelay: '0ms' }}
                        />
                        <span
                          className="w-1.5 h-1.5 bg-white/60 rounded-full mx-0.5 animate-bounce"
                          style={{ animationDelay: '150ms' }}
                        />
                        <span
                          className="w-1.5 h-1.5 bg-white/60 rounded-full mx-0.5 animate-bounce"
                          style={{ animationDelay: '300ms' }}
                        />
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Speech bubble tail */}
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
        <div
          className="w-4 h-4 rotate-45 border-r-2 border-b-2 bg-slate-800/90"
          style={{
            borderColor: `${config.color}40`
          }}
        />
      </div>
    </motion.div>
  );
};
