/**
 * MessageList Component
 * Single Responsibility: Render a list of messages with optimized rendering
 *
 * This component uses React.memo for performance optimization.
 * Each message item is memoized to prevent unnecessary re-renders.
 *
 * Usage:
 *   <MessageList
 *     messages={messages}
 *     error={error}
 *     result={result}
 *   />
 */

import React, { memo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MessageType } from '../../../shared/types';

export interface Message {
  id: string;
  type: MessageType;
  content: string;
  toolName?: string;
  timestamp: number;
}

export interface ResultData {
  result: string;
  costUsd: number;
  turns: number;
}

export interface MessageListProps {
  messages: Message[];
  error: string | null;
  result: ResultData | null;
}

/**
 * Get CSS classes for a message based on its type.
 */
function getMessageClasses(type: MessageType): string {
  switch (type) {
    case 'thinking':
      return 'bg-yellow-900/30 border border-yellow-700/50 text-yellow-200';
    case 'tool_use':
      return 'bg-blue-900/30 border border-blue-700/50 text-blue-200';
    default:
      return 'bg-slate-700/50 border border-slate-600/50 text-white/90';
  }
}

/**
 * Render a message header based on type.
 */
const MessageHeader = memo(function MessageHeader({
  type,
  toolName
}: {
  type: MessageType;
  toolName?: string;
}) {
  if (type === 'thinking') {
    return (
      <div className="text-xs text-yellow-400 mb-1 flex items-center gap-1">
        <span aria-hidden="true">💭</span>
        <span>Thinking</span>
      </div>
    );
  }

  if (type === 'tool_use') {
    return (
      <div className="text-xs text-blue-400 mb-1 flex items-center gap-1">
        <span aria-hidden="true">🔧</span>
        <span>{toolName || 'Tool'}</span>
      </div>
    );
  }

  return null;
});

/**
 * Individual message item - memoized for performance
 */
const MessageItem = memo(function MessageItem({
  message
}: {
  message: Message;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-3 rounded-lg text-sm ${getMessageClasses(message.type)}`}
      role="article"
      aria-label={`${message.type} message`}
    >
      <MessageHeader type={message.type} toolName={message.toolName} />
      <div className="whitespace-pre-wrap break-words">{message.content}</div>
    </motion.div>
  );
});

/**
 * Error display component - memoized
 */
const ErrorDisplay = memo(function ErrorDisplay({ error }: { error: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-3 rounded-lg bg-red-900/30 border border-red-700/50 text-red-200 text-sm"
      role="alert"
      aria-live="assertive"
    >
      <div className="text-xs text-red-400 mb-1 flex items-center gap-1">
        <span aria-hidden="true">❌</span>
        <span>Error</span>
      </div>
      {error}
    </motion.div>
  );
});

/**
 * Result display component - memoized
 */
const ResultDisplay = memo(function ResultDisplay({ result }: { result: ResultData }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-3 rounded-lg bg-emerald-900/30 border border-emerald-700/50 text-emerald-200 text-sm"
      role="status"
      aria-live="polite"
    >
      <div className="text-xs text-emerald-400 mb-1 flex items-center gap-1">
        <span aria-hidden="true">✅</span>
        <span>Complete</span>
      </div>
      <div className="text-xs text-white/50 mt-2">
        Cost: ${result.costUsd.toFixed(4)} | Turns: {result.turns}
      </div>
    </motion.div>
  );
});

/**
 * MessageList component displays all messages with animations.
 * Optimized with React.memo for better performance.
 */
export const MessageList = memo(function MessageList({
  messages,
  error,
  result
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div
      className="flex-1 overflow-y-auto p-4 space-y-3"
      role="log"
      aria-live="polite"
      aria-label="Agent messages"
    >
      <AnimatePresence>
        {messages.map((msg) => (
          <MessageItem key={msg.id} message={msg} />
        ))}
      </AnimatePresence>

      {/* Error Display */}
      {error && <ErrorDisplay error={error} />}

      {/* Result Display */}
      {result && <ResultDisplay result={result} />}

      <div ref={messagesEndRef} />
    </div>
  );
});

export default MessageList;
