/**
 * LeaderInput Component
 *
 * Command input form for leader widget.
 */

import { useState, useRef, FormEvent } from 'react';

interface LeaderInputProps {
  isProcessing: boolean;
  onSubmit: (command: string) => void;
}

export function LeaderInput({ isProcessing, onSubmit }: LeaderInputProps) {
  const [command, setCommand] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!command.trim() || isProcessing) return;

    onSubmit(command);
    setCommand('');
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-slate-800/50 border-t border-slate-700/50">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={isProcessing ? 'Processing...' : 'Enter command for the team...'}
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
            ${
              isProcessing || !command.trim()
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700 shadow-lg shadow-amber-500/20'
            }
            transition-all
          `}
        >
          {isProcessing ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </span>
          ) : (
            '실행'
          )}
        </button>
      </div>
    </form>
  );
}

export default LeaderInput;
