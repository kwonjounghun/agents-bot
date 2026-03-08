/**
 * LeaderHeader Component
 *
 * Header section for leader widget with avatar, badge, and close button.
 */

import { motion } from 'framer-motion';

interface LeaderHeaderProps {
  workingDirectory: string;
  isProcessing: boolean;
  onClose: () => void;
}

export function LeaderHeader({ workingDirectory, isProcessing, onClose }: LeaderHeaderProps) {
  // Truncate working directory for display
  const displayDir = workingDirectory.split('/').slice(-2).join('/');

  return (
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
        onClick={onClose}
        className="w-8 h-8 rounded-full bg-slate-700/50 hover:bg-red-500/30 flex items-center justify-center transition-colors"
      >
        <span className="text-slate-400 hover:text-red-400 text-lg">×</span>
      </button>
    </div>
  );
}

export default LeaderHeader;
