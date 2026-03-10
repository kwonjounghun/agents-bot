/**
 * AgentPanel Component
 *
 * Individual agent panel showing status and messages.
 */

import React, { useRef, useEffect, memo } from 'react';
import { motion } from 'framer-motion';
import { Agent } from '../../contexts/TeamsContext';
import { getAgentConfig } from '../../../../shared/agentTypes';
import { isActiveStatus, getStatusText } from '../../utils/statusHelpers';
import { MessageBubble } from '../../components/MessageBubble';

interface AgentPanelProps {
  agent: Agent;
}

export const AgentPanel = memo(function AgentPanel({ agent }: AgentPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const config = getAgentConfig(agent.role);

  // Auto-scroll to bottom only when new messages are added (not on content updates)
  const messageCount = agent.messages.length;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messageCount]);

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

  const isActive = isActiveStatus(agent.status);

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
            <span className="text-slate-400 text-xs">{getStatusText(agent.status)}</span>
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
});
