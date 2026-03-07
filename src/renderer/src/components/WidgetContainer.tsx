import { motion, AnimatePresence } from 'framer-motion';
import type { AgentRole, AgentStatus } from '../../../shared/types';
import { AGENT_CONFIG } from '../../../shared/agentTypes';
import { AgentAvatar } from './AgentAvatar';
import { SpeechBubble } from './SpeechBubble';

interface WidgetContainerProps {
  agentId: string;
  role: AgentRole;
  status: AgentStatus;
  currentMessage: string;
  messageType: 'thinking' | 'speaking';
  isStreaming: boolean;
}

export const WidgetContainer: React.FC<WidgetContainerProps> = ({
  role,
  status,
  currentMessage,
  messageType,
  isStreaming
}) => {
  const config = AGENT_CONFIG[role];

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

  const isActive = status === 'thinking' || status === 'responding' || status === 'using_tool';

  return (
    <div className="w-full h-full flex flex-col items-center justify-end p-3">
      {/* Speech Bubble Area */}
      <div className="flex-1 w-full flex items-end mb-3 min-h-0">
        <SpeechBubble
          role={role}
          content={currentMessage}
          type={messageType}
          isStreaming={isStreaming}
        />
      </div>

      {/* Avatar */}
      <AgentAvatar role={role} status={status} size="lg" />

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

      {/* Status Indicator - Simple without animation to avoid overlap */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <div
          className={`w-2 h-2 rounded-full ${getStatusColor()} ${isActive ? 'animate-pulse' : ''}`}
        />
        <span className="text-[10px] text-white/60">
          {getStatusText()}
        </span>
      </div>
    </div>
  );
};
