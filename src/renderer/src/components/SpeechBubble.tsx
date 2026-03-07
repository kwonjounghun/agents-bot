import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AgentRole } from '../../../shared/types';
import { AGENT_CONFIG } from '../../../shared/agentTypes';

interface SpeechBubbleProps {
  role: AgentRole;
  content: string;
  type: 'thinking' | 'speaking';
  isStreaming: boolean;
}

export const SpeechBubble: React.FC<SpeechBubbleProps> = ({
  role,
  content,
  type,
  isStreaming
}) => {
  const config = AGENT_CONFIG[role];
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content]);

  const isThinking = type === 'thinking';

  return (
    <AnimatePresence>
      {content && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full"
        >
          {/* Speech bubble */}
          <div
            className={`
              p-3 rounded-xl border-2 backdrop-blur-sm
              ${isThinking
                ? 'bg-slate-800/90 border-slate-600/50'
                : 'border-opacity-50'
              }
            `}
            style={{
              backgroundColor: isThinking ? undefined : `${config.color}15`,
              borderColor: isThinking ? undefined : `${config.color}50`
            }}
          >
            <div
              ref={scrollRef}
              className="text-xs text-white/90 leading-relaxed max-h-24 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20"
            >
              {isThinking && (
                <span className="text-yellow-400 mr-1">💭</span>
              )}
              <span className="whitespace-pre-wrap break-words">{content}</span>
              {isStreaming && (
                <span className="inline-flex ml-1 items-center">
                  <span className="w-1.5 h-1.5 bg-white/60 rounded-full mx-0.5 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-white/60 rounded-full mx-0.5 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-white/60 rounded-full mx-0.5 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              )}
            </div>
          </div>

          {/* Speech bubble tail */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
            <div
              className="w-4 h-4 rotate-45 border-r-2 border-b-2"
              style={{
                backgroundColor: isThinking ? 'rgb(30 41 59 / 0.9)' : `${config.color}15`,
                borderColor: isThinking ? 'rgb(71 85 105 / 0.5)' : `${config.color}50`
              }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
