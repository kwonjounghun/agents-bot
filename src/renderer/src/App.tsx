import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AgentStatus, MessageType, AgentRole, OMCStatusInfo } from '../../shared/types';
import { getAgentConfig } from '../../shared/agentTypes';

// OMC Status Badge Component
function OMCStatusBadge({ status, onClick }: { status: OMCStatusInfo | null; onClick: () => void }) {
  if (!status) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-700/50 border border-slate-600/50 text-slate-400 text-xs hover:bg-slate-700 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-slate-500" />
        <span>OMC</span>
      </button>
    );
  }

  if (!status.installed) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-900/30 border border-yellow-700/50 text-yellow-400 text-xs hover:bg-yellow-900/50 transition-colors"
        title="OMC not installed"
      >
        <span className="w-2 h-2 rounded-full bg-yellow-500" />
        <span>OMC</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-900/30 border border-emerald-700/50 text-emerald-400 text-xs hover:bg-emerald-900/50 transition-colors"
      title={`OMC v${status.version} - ${status.skillCount} skills`}
    >
      <span className="w-2 h-2 rounded-full bg-emerald-500" />
      <span>OMC {status.version}</span>
      {status.skillCount > 0 && (
        <span className="text-emerald-300/70">({status.skillCount})</span>
      )}
    </button>
  );
}

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
  const [teamActive, setTeamActive] = useState(false);
  const [activeAgents, setActiveAgents] = useState<{ id: string; role: AgentRole }[]>([]);
  const [omcStatus, setOmcStatus] = useState<OMCStatusInfo | null>(null);
  const [showOmcDetails, setShowOmcDetails] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false);

  useEffect(() => {
    // Load saved working directory
    window.claudeAPI?.getWorkingDirectory().then(dir => {
      if (dir) setWorkingDirectory(dir);
    });

    // Load OMC status
    window.claudeAPI?.getOMCStatus().then(status => {
      setOmcStatus(status);
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

    // Listen for auto-detected team agents
    const unsubAgentJoined = window.claudeAPI?.onAgentJoined(({ agentId, role }) => {
      console.log('[App] Agent joined:', role, agentId);
      setActiveAgents(prev => {
        // Avoid duplicates
        if (prev.find(a => a.id === agentId)) return prev;
        return [...prev, { id: agentId, role }];
      });
      setTeamActive(true);

      // Show notification
      setMessages(prev => {
        // Don't spam messages for each agent
        const hasTeamMsg = prev.find(m => m.id.startsWith('team-joined'));
        if (hasTeamMsg) return prev;
        return [...prev, {
          id: `team-joined-${Date.now()}`,
          type: 'text',
          content: `👥 Team agents detected - widgets spawned automatically`,
          timestamp: Date.now()
        }];
      });
    });

    const unsubAgentCompleted = window.claudeAPI?.onAgentCompleted(({ agentId, role }) => {
      console.log('[App] Agent completed:', role, agentId);
    });

    window.claudeAPI?.notifyReady();

    return () => {
      unsubMessage?.();
      unsubStatus?.();
      unsubToolUse?.();
      unsubError?.();
      unsubResult?.();
      unsubAgentJoined?.();
      unsubAgentCompleted?.();
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

  // Close team widgets (manual dismiss)
  const handleCloseTeam = () => {
    window.claudeAPI?.closeAllWidgets();
    setTeamActive(false);
    setActiveAgents([]);
    setMessages(prev => [...prev, {
      id: `system-${Date.now()}`,
      type: 'text',
      content: '👋 Team dismissed',
      timestamp: Date.now()
    }]);
  };

  const handleSend = async () => {
    if (!prompt.trim()) return;
    if (status !== 'idle' && status !== 'complete' && status !== 'error') return;

    // Clear previous state
    setMessages([]);
    setError(null);
    setResult(null);

    // Send prompt - team widgets will be spawned automatically when SDK detects agents
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
          <OMCStatusBadge
            status={omcStatus}
            onClick={() => setShowOmcDetails(!showOmcDetails)}
          />
          {teamActive && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={handleCloseTeam}
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-purple-500/20 border border-purple-500/50 text-purple-300 text-xs hover:bg-purple-500/30 transition-colors"
            >
              <span>👥 {activeAgents.length}</span>
              <span className="text-purple-400">✕</span>
            </motion.button>
          )}
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

      {/* OMC Details Panel */}
      <AnimatePresence>
        {showOmcDetails && omcStatus && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 py-3 border-b border-slate-700/30 bg-slate-800/30"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/80 text-xs font-medium">OMC Status</span>
              <button
                onClick={() => setShowOmcDetails(false)}
                className="text-white/40 hover:text-white/60 text-xs"
              >
                ✕
              </button>
            </div>
            {omcStatus.installed ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-emerald-400">✓ Installed</span>
                  <span className="text-white/50">v{omcStatus.version}</span>
                </div>
                <div className="text-xs text-white/60">
                  {omcStatus.skillCount} skills available
                </div>
                {omcStatus.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {omcStatus.skills.slice(0, 8).map(skill => (
                      <span
                        key={skill}
                        className="px-1.5 py-0.5 rounded bg-slate-700/50 text-white/50 text-xs"
                      >
                        /{skill}
                      </span>
                    ))}
                    {omcStatus.skills.length > 8 && (
                      <span className="text-white/30 text-xs">
                        +{omcStatus.skills.length - 8} more
                      </span>
                    )}
                  </div>
                )}
                {omcStatus.activeModes.length > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-yellow-400 text-xs">Active:</span>
                    {omcStatus.activeModes.map(mode => (
                      <span
                        key={mode}
                        className="px-1.5 py-0.5 rounded bg-yellow-900/30 border border-yellow-700/50 text-yellow-300 text-xs"
                      >
                        {mode}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-yellow-400">
                OMC not installed. Install via CLI: <code className="bg-slate-700/50 px-1 rounded">claude /omc-setup</code>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

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
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={(e) => {
            setIsComposing(false);
            // Ensure final composed value is captured
            setPrompt(e.currentTarget.value);
          }}
          placeholder="Enter your prompt..."
          disabled={status !== 'idle'}
          onKeyDown={(e) => {
            // Don't submit while composing (Korean/Japanese/Chinese input)
            if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
              e.preventDefault();
              handleSend();
            }
          }}
          className="w-full h-20 bg-slate-700/50 border border-slate-600/50 rounded-lg px-4 py-3 text-white placeholder-white/30 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />

        <div className="flex gap-2">
          {status === 'idle' || status === 'complete' || status === 'error' ? (
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
