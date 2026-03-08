/**
 * AgentPanel Component
 *
 * Individual agent panel showing status and messages.
 */

import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Agent } from '../../contexts/TeamsContext';
import { getAgentConfig } from '../../../../shared/agentTypes';

interface AgentPanelProps {
  agent: Agent;
}

export function AgentPanel({ agent }: AgentPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const config = getAgentConfig(agent.role);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agent.messages]);

  const getStatusColor = () => {
    switch (agent.status) {
      case 'thinking': return 'border-yellow-500/50 shadow-yellow-500/20';
      case 'responding': return 'border-green-500/50 shadow-green-500/20';
      case 'using_tool': return 'border-blue-500/50 shadow-blue-500/20';
      case 'complete': return 'border-emerald-500/50';
      case 'error': return 'border-red-500/50';
      case 'stopped': return 'border-orange-500/50 shadow-orange-500/20';
      default: return 'border-slate-600/50';
    }
  };

  const getStatusText = () => {
    switch (agent.status) {
      case 'thinking': return 'Thinking...';
      case 'responding': return 'Responding...';
      case 'using_tool': return 'Using tool...';
      case 'complete': return 'Complete';
      case 'error': return 'Error';
      case 'stopped': return 'Stopped';
      default: return 'Idle';
    }
  };

  const isActive = agent.status === 'thinking' || agent.status === 'responding' || agent.status === 'using_tool';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`
        flex flex-col bg-slate-800 rounded-lg overflow-hidden
        border-2 transition-all duration-300
        ${getStatusColor()}
        ${isActive ? 'shadow-lg' : ''}
      `}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-700 bg-slate-800/80 flex items-center gap-2">
        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
          style={{ backgroundColor: config.color + '30' }}
        >
          {config.emoji}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-white text-sm font-medium truncate">
            {agent.isLeader ? '👔 Leader' : config.name}
          </div>
          <div className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: isActive ? config.color : '#64748b' }}
            />
            <span className="text-slate-400 text-xs">{getStatusText()}</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {agent.messages.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-4">
            Waiting for activity...
          </div>
        ) : (
          agent.messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
    </motion.div>
  );
}

function MessageBubble({ message }: { message: Agent['messages'][0] }) {
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
      {getIcon() && (
        <span className="mr-1">{getIcon()}</span>
      )}
      <span className="whitespace-pre-wrap break-words">
        {message.content.length > 500
          ? message.content.slice(0, 500) + '...'
          : message.content
        }
      </span>
      {message.isStreaming && (
        <span className="inline-block w-1.5 h-3 bg-current animate-pulse ml-0.5" />
      )}
    </div>
  );
}
