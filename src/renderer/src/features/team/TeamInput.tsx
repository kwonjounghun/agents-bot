/**
 * TeamInput Component
 *
 * Input area for sending commands to the team leader.
 */

import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTeams } from '../../contexts/TeamsContext';

interface TeamInputProps {
  teamId: string;
  leaderId: string;
}

export function TeamInput({ teamId, leaderId }: TeamInputProps) {
  const { state, sendCommand } = useTeams();
  const [input, setInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const team = state.teams.get(teamId);
  const leader = team?.agents.find(a => a.id === leaderId);
  const isProcessing = leader?.status === 'thinking' || leader?.status === 'responding' || leader?.status === 'using_tool';

  const handleSend = () => {
    if (!input.trim() || isProcessing) return;
    sendCommand(teamId, input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-4 bg-slate-800/50">
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={handleKeyDown}
          placeholder="Enter command for the team leader..."
          disabled={isProcessing}
          className={`
            flex-1 bg-slate-700/50 border border-slate-600/50 rounded-lg
            px-4 py-3 text-white placeholder-white/30 text-sm
            resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50
            ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          rows={2}
        />

        <motion.button
          whileHover={{ scale: isProcessing ? 1 : 1.05 }}
          whileTap={{ scale: isProcessing ? 1 : 0.95 }}
          onClick={handleSend}
          disabled={!input.trim() || isProcessing}
          className={`
            px-6 rounded-lg font-medium text-sm
            transition-all
            ${input.trim() && !isProcessing
              ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600 shadow-lg shadow-blue-500/25'
              : 'bg-slate-700/50 text-white/30 cursor-not-allowed'
            }
          `}
        >
          {isProcessing ? (
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            'Send'
          )}
        </motion.button>
      </div>
    </div>
  );
}
