/**
 * Widget Component (New Version)
 *
 * Sub-agent widget with accumulating speech bubbles.
 * Key feature: Messages accumulate and never replace -
 * text keeps growing within each section until a new section starts.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AgentRole, AgentStatus, WidgetMessage, SpeechMessage } from '../../shared/types';
import { AGENT_CONFIG } from '../../shared/agentTypes';
import { AccumulatingSpeechBubble } from './components/AccumulatingSpeechBubble';
import { AgentAvatar } from './components/AgentAvatar';

function Widget() {
  const [agentId, setAgentId] = useState('');
  const [role, setRole] = useState<AgentRole>('executor');
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [messages, setMessages] = useState<SpeechMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  // Track the current section type
  const currentSectionRef = useRef<{ id: string; type: string } | null>(null);
  // Track reset timeout to prevent memory leak
  const resetTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Map widget message type to speech message type
  const mapMessageType = useCallback((type: WidgetMessage['type']): SpeechMessage['type'] => {
    switch (type) {
      case 'thinking': return 'thinking';
      case 'tool_use': return 'tool_use';
      case 'tool_result': return 'tool_result';
      case 'speaking':
      default: return 'speaking';
    }
  }, []);

  // Generate a unique section ID
  const generateSectionId = useCallback(() => {
    return `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  useEffect(() => {
    // Get widget identity from URL params
    const params = window.widgetAPI?.getWidgetParams();
    if (params) {
      setAgentId(params.agentId);
      setRole(params.role as AgentRole);
    }

    // Subscribe to messages
    const unsubMessage = window.widgetAPI?.onMessage((message: WidgetMessage) => {
      console.log('[Widget] Received message:', message.type, 'content length:', message.content?.length);

      if (message.type === 'complete') {
        console.log('[Widget] Message type: complete');
        // Mark the last section as complete
        setMessages(prev => {
          if (prev.length === 0) return prev;
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, isComplete: true } : m
          );
        });
        setIsStreaming(false);
        currentSectionRef.current = null;
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
          setMessages([]);
          setIsStreaming(false);
          currentSectionRef.current = null;
          resetTimeoutRef.current = null;
        }, 2000);
      } else if (data.status === 'complete') {
        setIsStreaming(false);
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
  }, [mapMessageType, generateSectionId]);

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
