/**
 * Leader Widget Component (New Version)
 *
 * Team Leader agent widget with "리더" badge and command input.
 * Displays leader status with accumulating messages and manages sub-agent overview.
 */

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AgentStatus, AgentRole, SpeechMessage } from '../../shared/types';
import { useMessageAccumulator, type IncomingMessage } from './hooks/useMessageAccumulator';

interface SubAgentInfo {
  agentId: string;
  role: AgentRole;
  status: AgentStatus;
}

function LeaderWidget() {
  const [leaderId, setLeaderId] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [command, setCommand] = useState('');
  const [subAgents, setSubAgents] = useState<SubAgentInfo[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use shared message accumulator hook
  const { messages, handleMessage, handleComplete, clearMessages } = useMessageAccumulator();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    // Get leader params
    const params = window.leaderAPI?.getLeaderParams();
    if (params) {
      setLeaderId(params.leaderId);
      setWorkingDirectory(params.workingDirectory);
    }

    // Notify ready
    window.leaderAPI?.notifyReady();

    // Subscribe to events - use shared accumulator hook
    const unsubMessage = window.leaderAPI?.onMessage((message: IncomingMessage) => {
      if (message.type === 'complete') {
        handleComplete();
        setIsProcessing(false);
        return;
      }

      if (message.type === 'error') {
        setError(message.content);
        setIsProcessing(false);
        return;
      }

      handleMessage(message);
    });

    const unsubStatus = window.leaderAPI?.onStatus((newStatus) => {
      setStatus(newStatus);
      if (newStatus === 'idle' || newStatus === 'complete') {
        setIsProcessing(false);
      } else if (newStatus === 'thinking' || newStatus === 'responding') {
        setIsProcessing(true);
      }
    });

    const unsubSubAgentStatus = window.leaderAPI?.onSubAgentStatus((data) => {
      setSubAgents((prev) => {
        const existing = prev.find((a) => a.agentId === data.agentId);
        if (existing) {
          return prev.map((a) =>
            a.agentId === data.agentId ? { ...a, status: data.status } : a
          );
        }
        return [...prev, { agentId: data.agentId, role: data.role, status: data.status }];
      });
    });

    const unsubSubAgentCreated = window.leaderAPI?.onSubAgentCreated((data) => {
      setSubAgents((prev) => {
        if (prev.find((a) => a.agentId === data.agentId)) return prev;
        return [...prev, { agentId: data.agentId, role: data.role, status: 'idle' }];
      });
    });

    const unsubSubAgentRemoved = window.leaderAPI?.onSubAgentRemoved((data) => {
      setSubAgents((prev) => prev.filter((a) => a.agentId !== data.agentId));
    });

    const unsubError = window.leaderAPI?.onError((err) => {
      setError(err);
      setIsProcessing(false);
    });

    const unsubResult = window.leaderAPI?.onResult(() => {
      setIsProcessing(false);
    });

    return () => {
      unsubMessage?.();
      unsubStatus?.();
      unsubSubAgentStatus?.();
      unsubSubAgentCreated?.();
      unsubSubAgentRemoved?.();
      unsubError?.();
      unsubResult?.();
    };
  }, [handleMessage, handleComplete]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || isProcessing) return;

    setIsProcessing(true);
    setError(null);
    clearMessages(); // Clear previous messages
    window.leaderAPI?.sendCommand(command);
    setCommand('');
  };

  const handleClose = () => {
    window.leaderAPI?.requestClose();
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

  const getStatusText = () => {
    switch (status) {
      case 'thinking': return 'Thinking...';
      case 'responding': return 'Responding...';
      case 'using_tool': return 'Working...';
      case 'complete': return 'Complete';
      case 'error': return 'Error';
      default: return 'Ready';
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

  // Truncate working directory for display
  const displayDir = workingDirectory.split('/').slice(-2).join('/');

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-slate-900 to-slate-950 rounded-2xl overflow-hidden border border-slate-700/50 shadow-2xl">
      {/* Header with Leader Badge */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/80 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          {/* Leader Avatar */}
          <motion.div
            className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg"
            animate={isProcessing ? { scale: [1, 1.05, 1] } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <span className="text-2xl">👔</span>
          </motion.div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">Team Leader</span>
              {/* Leader Badge - Korean */}
              <span className="px-2 py-0.5 text-xs font-bold bg-amber-500 text-black rounded-full tracking-wider">
                리더
              </span>
            </div>
            <div className="text-xs text-slate-400 truncate max-w-[180px]" title={workingDirectory}>
              📁 {displayDir}
            </div>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={handleClose}
          className="w-8 h-8 rounded-full bg-slate-700/50 hover:bg-red-500/30 flex items-center justify-center transition-colors"
        >
          <span className="text-slate-400 hover:text-red-400 text-lg">×</span>
        </button>
      </div>

      {/* Status Bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/40 border-b border-slate-700/30">
        <div className={`w-2 h-2 rounded-full ${getStatusColor()} ${isProcessing ? 'animate-pulse' : ''}`} />
        <span className="text-xs text-slate-400">{getStatusText()}</span>

        {/* Sub-agent count */}
        {subAgents.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-slate-500">Sub-agents:</span>
            <span className="text-xs font-medium text-cyan-400">{subAgents.length}</span>
          </div>
        )}
      </div>

      {/* Sub-agents Overview */}
      <AnimatePresence>
        {subAgents.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 py-2 bg-slate-800/20 border-b border-slate-700/30 overflow-hidden"
          >
            <div className="flex flex-wrap gap-2">
              {subAgents.map((agent) => (
                <motion.div
                  key={agent.agentId}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className={`
                    px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1.5
                    ${agent.status === 'thinking' ? 'bg-yellow-500/20 text-yellow-400' :
                      agent.status === 'responding' ? 'bg-green-500/20 text-green-400' :
                      agent.status === 'using_tool' ? 'bg-blue-500/20 text-blue-400' :
                      agent.status === 'complete' ? 'bg-emerald-500/20 text-emerald-400' :
                      'bg-slate-700/50 text-slate-400'}
                  `}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    agent.status === 'thinking' ? 'bg-yellow-400 animate-pulse' :
                    agent.status === 'responding' ? 'bg-green-400 animate-pulse' :
                    agent.status === 'using_tool' ? 'bg-blue-400 animate-pulse' :
                    agent.status === 'complete' ? 'bg-emerald-400' :
                    'bg-slate-500'
                  }`} />
                  {agent.role}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Area - Accumulated */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {messages.length === 0 && !error && (
          <div className="text-center text-slate-500 text-sm py-8">
            Enter a command to start...
          </div>
        )}

        {messages.map((msg, idx) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`
              text-sm p-3 rounded-lg
              ${msg.type === 'thinking' ? 'bg-slate-800/60 text-yellow-100/80 border-l-2 border-yellow-500/50' :
                msg.type === 'tool_use' ? 'bg-blue-900/30 text-blue-100/80 border-l-2 border-blue-500/50' :
                msg.type === 'tool_result' ? 'bg-green-900/30 text-green-100/80 border-l-2 border-green-500/50' :
                'bg-slate-800/40 text-slate-200 border-l-2 border-slate-500/30'}
              ${msg.isComplete ? 'opacity-80' : ''}
            `}
          >
            <div className="flex items-start gap-2">
              <span className="flex-shrink-0">{getTypeIcon(msg.type)}</span>
              <div className="flex-1 whitespace-pre-wrap break-words">
                {msg.content}
                {/* Streaming indicator for the last incomplete message */}
                {!msg.isComplete && isProcessing && idx === messages.length - 1 && (
                  <span className="inline-flex ml-1 items-center">
                    <span className="w-1.5 h-1.5 bg-white/60 rounded-full mx-0.5 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-white/60 rounded-full mx-0.5 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-white/60 rounded-full mx-0.5 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                )}
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

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="p-3 bg-slate-800/50 border-t border-slate-700/50">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder={isProcessing ? "Processing..." : "Enter command for the team..."}
            disabled={isProcessing}
            className={`
              flex-1 px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-600/50
              text-white placeholder-slate-500 text-sm
              focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all
            `}
          />
          <button
            type="submit"
            disabled={isProcessing || !command.trim()}
            className={`
              px-4 py-2.5 rounded-xl font-medium text-sm
              ${isProcessing || !command.trim()
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700 shadow-lg shadow-amber-500/20'}
              transition-all
            `}
          >
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </span>
            ) : (
              '실행'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default LeaderWidget;
