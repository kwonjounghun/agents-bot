/**
 * MessageBubble Component
 *
 * Displays a single agent message with appropriate styling based on type.
 */

import { memo } from 'react';
import type { AgentMessage } from '../../../shared/types';

interface MessageBubbleProps {
  message: AgentMessage;
}

export const MessageBubble = memo(function MessageBubble({ message }: MessageBubbleProps) {
  const getStyle = () => {
    switch (message.type) {
      case 'thinking':
        return 'bg-yellow-900/30 border-yellow-700/50 text-yellow-200';
      case 'tool_use':
        return 'bg-blue-900/30 border-blue-700/50 text-blue-200';
      case 'error':
        return 'bg-red-900/30 border-red-700/50 text-red-200';
      case 'result':
        return 'bg-emerald-900/30 border-emerald-700/50 text-emerald-200';
      default:
        return 'bg-slate-700/50 border-slate-600/50 text-white/90';
    }
  };

  const getIcon = () => {
    switch (message.type) {
      case 'thinking': return '💭';
      case 'tool_use': return '🔧';
      case 'error': return '❌';
      case 'result': return '✅';
      default: return null;
    }
  };

  return (
    <div className={`p-2 rounded-lg border text-xs ${getStyle()}`}>
      {(() => {
        const icon = getIcon();
        return icon ? <span className="mr-1">{icon}</span> : null;
      })()}
      <span className="whitespace-pre-wrap break-words">
        {message.content}
      </span>
      {message.isStreaming && (
        <span className="inline-block w-1.5 h-3 bg-current animate-pulse ml-0.5" />
      )}
    </div>
  );
});
