/**
 * Widget Component (New Version)
 *
 * Sub-agent widget with accumulating speech bubbles.
 * Key feature: Messages accumulate and never replace -
 * text keeps growing within each section until a new section starts.
 */

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AgentRole, AgentStatus, WidgetMessage } from '../../shared/types';
import { AGENT_CONFIG } from '../../shared/agentTypes';
import { AccumulatingSpeechBubble } from './components/AccumulatingSpeechBubble';
import { AgentAvatar } from './components/AgentAvatar';
import { useMessageAccumulator } from './hooks/useMessageAccumulator';

function Widget() {
  const [agentId, setAgentId] = useState('');
  const [role, setRole] = useState<AgentRole>('executor');
  const [status, setStatus] = useState<AgentStatus>('idle');

  // Use shared message accumulator hook
  const { messages, isStreaming, handleMessage, clearMessages } = useMessageAccumulator();

  // Track reset timeout to prevent memory leak
  const resetTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Get widget identity from URL params
    const params = window.widgetAPI?.getWidgetParams();
    if (params) {
      setAgentId(params.agentId);
      setRole(params.role as AgentRole);
    }

    // Subscribe to messages - use shared accumulator hook
    const unsubMessage = window.widgetAPI?.onMessage((message: WidgetMessage) => {
      console.log('[Widget] Received message:', message.type, 'content length:', message.content?.length);
      handleMessage(message);
    });

    const unsubStatus = window.widgetAPI?.onStatus((data) => {
      console.log('[Widget] Received status:', data.status);
      setStatus(data.status);

      if (data.status === 'idle') {
        // Clear any existing timeout to prevent memory leak
        if (resetTimeoutRef.current) {
          clearTimeout(resetTimeoutRef.current);
        }
        // Reset after delay to show last message
        resetTimeoutRef.current = setTimeout(() => {
          clearMessages();
          resetTimeoutRef.current = null;
        }, 2000);
      }
    });

    const unsubClose = window.widgetAPI?.onClose(() => {
      window.close();
    });

    return () => {
      unsubMessage?.();
      unsubStatus?.();
      unsubClose?.();
      // Clear timeout on unmount to prevent memory leak
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, [handleMessage, clearMessages]);

  const config = AGENT_CONFIG[role];
  const isActive = status === 'thinking' || status === 'responding' || status === 'using_tool';

  const getStatusText = () => {
    switch (status) {
      case 'thinking': return 'Thinking...';
      case 'responding': return 'Speaking...';
      case 'using_tool': return 'Working...';
      case 'complete': return 'Done';
      case 'error': return 'Error';
      default: return 'Ready';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'thinking': return 'bg-yellow-400';
      case 'responding': return 'bg-green-400';
      case 'using_tool': return 'bg-blue-400';
      case 'complete': return 'bg-emerald-400';
      case 'error': return 'bg-red-400';
      default: return 'bg-gray-400';
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-end p-3">
      {/* Speech Bubble Area - Accumulated messages */}
      <div className="flex-1 w-full flex items-end mb-2 min-h-0 relative">
        <AnimatePresence>
          {messages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              className="w-full"
            >
              <AccumulatingSpeechBubble
                role={role}
                messages={messages}
                isStreaming={isStreaming}
                maxHeight={140}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating thought dots when thinking but no message yet */}
        <AnimatePresence>
          {isActive && messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 flex items-center gap-1"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                className="w-2 h-2 rounded-full bg-white/40"
              />
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                className="w-2.5 h-2.5 rounded-full bg-white/50"
              />
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                className="w-3 h-3 rounded-full bg-white/60"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Avatar with glow effect when active */}
      <motion.div
        className="relative"
        animate={isActive ? {
          filter: ['drop-shadow(0 0 8px rgba(255,255,255,0.3))', 'drop-shadow(0 0 16px rgba(255,255,255,0.5))', 'drop-shadow(0 0 8px rgba(255,255,255,0.3))']
        } : {}}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <AgentAvatar role={role} status={status} size="lg" />

        {/* Sub-agent indicator ring */}
        {isActive && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-white/30"
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </motion.div>

      {/* Agent Name Label */}
      <motion.div
        className="mt-2 px-3 py-1 rounded-full text-xs font-medium text-white shadow-lg"
        style={{
          backgroundColor: `${config.color}CC`,
          boxShadow: `0 2px 10px ${config.color}40`
        }}
      >
        {config.name}
      </motion.div>

      {/* Status Indicator */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <motion.div
          className={`w-2 h-2 rounded-full ${getStatusColor()}`}
          animate={isActive ? { scale: [1, 1.3, 1] } : {}}
          transition={{ duration: 1, repeat: Infinity }}
        />
        <span className="text-xs text-white/60">
          {getStatusText()}
        </span>
      </div>
    </div>
  );
}

export default Widget;
