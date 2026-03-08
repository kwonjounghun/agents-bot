/**
 * LeaderStatusBar Component
 *
 * Status bar showing current status and sub-agent count.
 */

import type { AgentStatus } from '../../shared';
import { getStatusText, getStatusColorClass } from '../../shared';

interface LeaderStatusBarProps {
  status: AgentStatus;
  isProcessing: boolean;
  subAgentCount: number;
}

export function LeaderStatusBar({ status, isProcessing, subAgentCount }: LeaderStatusBarProps) {
  const colorClass = getStatusColorClass(status);
  const statusText = getStatusText(status);

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/40 border-b border-slate-700/30">
      <div className={`w-2 h-2 rounded-full ${colorClass} ${isProcessing ? 'animate-pulse' : ''}`} />
      <span className="text-xs text-slate-400">{statusText}</span>

      {/* Sub-agent count */}
      {subAgentCount > 0 && (
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-slate-500">Sub-agents:</span>
          <span className="text-xs font-medium text-cyan-400">{subAgentCount}</span>
        </div>
      )}
    </div>
  );
}

export default LeaderStatusBar;
