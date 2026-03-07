import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AgentStatus, MessageType } from '../../shared/types';

interface Message {
  id: string;
  type: MessageType;
  content: string;
  toolName?: string;
  timestamp: number;
}

function App() {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [workingDirectory, setWorkingDirectory] = useState<string | null>(null);
  const [currentToolUse, setCurrentToolUse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ result: string; costUsd: number; turns: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load saved working directory
    window.claudeAPI?.getWorkingDirectory().then(dir => {
      if (dir) setWorkingDirectory(dir);
    });

    // Setup event listeners
    const unsubMessage = window.claudeAPI?.onMessage(({ messageId, chunk, type }) => {
      setMessages(prev => {
        const existing = prev.find(m => m.id === messageId);
        if (existing) {
          return prev.map(m =>
            m.id === messageId
              ? { ...m, content: m.content + chunk }
              : m
          );
        }
        return [...prev, {
          id: messageId,
          type,
          content: chunk,
          timestamp: Date.now()
        }];
      });
    });

    const unsubStatus = window.claudeAPI?.onStatus(({ status: newStatus }) => {
      setStatus(newStatus);
      if (newStatus === 'idle' || newStatus === 'complete') {
        setCurrentToolUse(null);
      }
    });

    const unsubToolUse = window.claudeAPI?.onToolUse(({ toolName }) => {
      setCurrentToolUse(toolName);
    });

    const unsubError = window.claudeAPI?.onError(({ error: err }) => {
      setError(err);
    });

    const unsubResult = window.claudeAPI?.onResult((res) => {
      setResult(res);
    });

    window.claudeAPI?.notifyReady();

    return () => {
      unsubMessage?.();
      unsubStatus?.();
      unsubToolUse?.();
      unsubError?.();
      unsubResult?.();
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectDirectory = async () => {
    const dir = await window.claudeAPI?.selectDirectory();
    if (dir) {
      setWorkingDirectory(dir);
    }
  };

  const handleSend = () => {
    if (!prompt.trim() || status !== 'idle') return;

    // Clear previous state
    setMessages([]);
    setError(null);
    setResult(null);

    // Send prompt
    window.claudeAPI?.sendPrompt(prompt, workingDirectory || undefined);
    setPrompt('');
  };

  const handleStop = () => {
    window.claudeAPI?.stop();
  };

  const handleClear = () => {
    setMessages([]);
    setError(null);
    setResult(null);
    setStatus('idle');
  };

  const getStatusText = () => {
    switch (status) {
      case 'thinking': return 'Thinking...';
      case 'responding': return 'Responding...';
      case 'using_tool': return currentToolUse ? `Using ${currentToolUse}...` : 'Using tool...';
      case 'complete': return 'Complete';
      case 'error': return 'Error';
      default: return 'Ready';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'thinking': return 'bg-yellow-500';
      case 'responding': return 'bg-green-500';
      case 'using_tool': return 'bg-blue-500';
      case 'complete': return 'bg-emerald-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  const getDirectoryName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  };

  return (
    <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      {/* Header */}
      <div className="bg-slate-800/50 px-4 py-3 flex items-center justify-between border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <span className="text-xl">🤖</span>
          <h1 className="text-white/90 text-sm font-medium">Claude Agent</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${getStatusColor()} ${status !== 'idle' && status !== 'complete' ? 'animate-pulse' : ''}`} />
          <span className="text-white/60 text-xs">{getStatusText()}</span>
        </div>
      </div>

      {/* Directory Selection */}
      <div className="px-4 py-2 border-b border-slate-700/30">
        <button
          onClick={handleSelectDirectory}
          disabled={status !== 'idle'}
          className={`
            w-full px-3 py-2 rounded-lg border text-left text-sm transition-all
            ${workingDirectory
              ? 'bg-emerald-900/30 border-emerald-600/50 text-emerald-300'
              : 'bg-slate-700/30 border-slate-600/50 text-white/50 hover:bg-slate-700/50'
            }
            ${status !== 'idle' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          <div className="flex items-center gap-2">
            <span>📁</span>
            {workingDirectory ? (
              <span className="truncate">{getDirectoryName(workingDirectory)}</span>
            ) : (
              <span>Select project directory...</span>
            )}
          </div>
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`
                p-3 rounded-lg text-sm
                ${msg.type === 'thinking'
                  ? 'bg-yellow-900/30 border border-yellow-700/50 text-yellow-200'
                  : msg.type === 'tool_use'
                  ? 'bg-blue-900/30 border border-blue-700/50 text-blue-200'
                  : 'bg-slate-700/50 border border-slate-600/50 text-white/90'
                }
              `}
            >
              {msg.type === 'thinking' && (
                <div className="text-xs text-yellow-400 mb-1 flex items-center gap-1">
                  💭 Thinking
                </div>
              )}
              {msg.type === 'tool_use' && (
                <div className="text-xs text-blue-400 mb-1 flex items-center gap-1">
                  🔧 {msg.toolName || 'Tool'}
                </div>
              )}
              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Error Display */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg bg-red-900/30 border border-red-700/50 text-red-200 text-sm"
          >
            <div className="text-xs text-red-400 mb-1">❌ Error</div>
            {error}
          </motion.div>
        )}

        {/* Result Display */}
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg bg-emerald-900/30 border border-emerald-700/50 text-emerald-200 text-sm"
          >
            <div className="text-xs text-emerald-400 mb-1">✅ Complete</div>
            <div className="text-xs text-white/50 mt-2">
              Cost: ${result.costUsd.toFixed(4)} | Turns: {result.turns}
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-slate-700/50 space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your prompt..."
          disabled={status !== 'idle'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          className="w-full h-20 bg-slate-700/50 border border-slate-600/50 rounded-lg px-4 py-3 text-white placeholder-white/30 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />

        <div className="flex gap-2">
          {status === 'idle' ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSend}
              disabled={!prompt.trim()}
              className={`
                flex-1 py-3 rounded-lg font-medium text-sm transition-all
                ${prompt.trim()
                  ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600 shadow-lg shadow-blue-500/25'
                  : 'bg-slate-700/50 text-white/30 cursor-not-allowed'
                }
              `}
            >
              Send 🚀
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStop}
              className="flex-1 py-3 rounded-lg font-medium text-sm bg-red-500/80 text-white hover:bg-red-500 transition-all"
            >
              Stop ⏹
            </motion.button>
          )}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleClear}
            className="px-4 py-3 rounded-lg font-medium text-sm bg-slate-700/50 text-white/60 hover:bg-slate-700 hover:text-white/80 transition-all"
          >
            Clear
          </motion.button>
        </div>
      </div>
    </div>
  );
}

export default App;
