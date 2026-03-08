/**
 * LeaderMessageList Component
 *
 * Scrollable message list for leader widget.
 */

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { SpeechMessage } from '../../shared';
import { StreamingIndicator } from '../../shared';

interface LeaderMessageListProps {
  messages: SpeechMessage[];
  isProcessing: boolean;
  error: string | null;
}

function getTypeIcon(type: SpeechMessage['type']): string {
  switch (type) {
    case 'thinking':
      return '💭';
    case 'speaking':
      return '💬';
    case 'tool_use':
      return '🔧';
    case 'tool_result':
      return '📤';
    default:
      return '';
  }
}

function getMessageStyles(type: SpeechMessage['type'], isComplete: boolean): string {
  const baseStyles = 'text-sm p-3 rounded-lg';
  const opacityStyle = isComplete ? 'opacity-80' : '';

  switch (type) {
    case 'thinking':
      return `${baseStyles} bg-slate-800/60 text-yellow-100/80 border-l-2 border-yellow-500/50 ${opacityStyle}`;
    case 'tool_use':
      return `${baseStyles} bg-blue-900/30 text-blue-100/80 border-l-2 border-blue-500/50 ${opacityStyle}`;
    case 'tool_result':
      return `${baseStyles} bg-green-900/30 text-green-100/80 border-l-2 border-green-500/50 ${opacityStyle}`;
    default:
      return `${baseStyles} bg-slate-800/40 text-slate-200 border-l-2 border-slate-500/30 ${opacityStyle}`;
  }
}

export function LeaderMessageList({ messages, isProcessing, error }: LeaderMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
      {messages.length === 0 && !error && (
        <div className="text-center text-slate-500 text-sm py-8">Enter a command to start...</div>
      )}

      {messages.map((msg, idx) => (
        <motion.div
          key={msg.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={getMessageStyles(msg.type, msg.isComplete)}
        >
          <div className="flex items-start gap-2">
            <span className="flex-shrink-0">{getTypeIcon(msg.type)}</span>
            <div className="flex-1 whitespace-pre-wrap break-words">
              {msg.content}
              {/* Streaming indicator for the last incomplete message */}
              {!msg.isComplete && isProcessing && idx === messages.length - 1 && <StreamingIndicator />}
            </div>
          </div>
        </motion.div>
      ))}

      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm p-3 rounded-lg bg-red-900/30 text-red-200 border border-red-500/30"
        >
          ⚠️ {error}
        </motion.div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}

export default LeaderMessageList;
