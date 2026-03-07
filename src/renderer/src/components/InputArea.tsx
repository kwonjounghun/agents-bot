/**
 * InputArea Component
 * Single Responsibility: Handle user input with CJK composition support
 *
 * This component handles:
 * - Text input with proper CJK (Korean/Japanese/Chinese) composition
 * - Send/Stop/Clear button states
 * - Keyboard shortcuts (Enter to send)
 *
 * Usage:
 *   <InputArea
 *     value={prompt}
 *     onChange={setPrompt}
 *     onSend={handleSend}
 *     onStop={handleStop}
 *     onClear={handleClear}
 *     disabled={isDisabled}
 *     isRunning={isRunning}
 *   />
 */

import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';

export interface InputAreaProps {
  /**
   * Current input value.
   */
  value: string;

  /**
   * Called when input value changes.
   */
  onChange: (value: string) => void;

  /**
   * Called when user wants to send the prompt.
   */
  onSend: () => void;

  /**
   * Called when user wants to stop the current query.
   */
  onStop: () => void;

  /**
   * Called when user wants to clear messages.
   */
  onClear: () => void;

  /**
   * Whether input is disabled.
   */
  disabled?: boolean;

  /**
   * Whether a query is currently running.
   */
  isRunning?: boolean;

  /**
   * Placeholder text.
   */
  placeholder?: string;
}

/**
 * InputArea component with CJK composition support.
 */
export function InputArea({
  value,
  onChange,
  onSend,
  onStop,
  onClear,
  disabled = false,
  isRunning = false,
  placeholder = 'Enter your prompt...'
}: InputAreaProps) {
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleCompositionStart = useCallback(() => {
    setIsComposing(true);
  }, []);

  const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLTextAreaElement>) => {
    setIsComposing(false);
    // Ensure final composed value is captured
    onChange(e.currentTarget.value);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Don't submit while composing (Korean/Japanese/Chinese input)
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      onSend();
    }
  }, [isComposing, onSend]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  }, [onChange]);

  const canSend = value.trim() && !disabled && !isRunning;

  return (
    <div className="p-4 border-t border-slate-700/50 space-y-3">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        placeholder={placeholder}
        disabled={disabled}
        onKeyDown={handleKeyDown}
        className="w-full h-20 bg-slate-700/50 border border-slate-600/50 rounded-lg px-4 py-3 text-white placeholder-white/30 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50"
      />

      <div className="flex gap-2">
        {!isRunning ? (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onSend}
            disabled={!canSend}
            className={`
              flex-1 py-3 rounded-lg font-medium text-sm transition-all
              ${canSend
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
            onClick={onStop}
            className="flex-1 py-3 rounded-lg font-medium text-sm bg-red-500/80 text-white hover:bg-red-500 transition-all"
          >
            Stop ⏹
          </motion.button>
        )}

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onClear}
          className="px-4 py-3 rounded-lg font-medium text-sm bg-slate-700/50 text-white/60 hover:bg-slate-700 hover:text-white/80 transition-all"
        >
          Clear
        </motion.button>
      </div>
    </div>
  );
}

export default InputArea;
