/**
 * SubagentOverview Component
 *
 * Overview panel showing active sub-agents with status pills.
 */

import { motion, AnimatePresence } from 'framer-motion';
import type { SubAgentInfo } from '../../shared';
import { getStatusColorClass } from '../../shared';

interface SubagentOverviewProps {
  subAgents: SubAgentInfo[];
}

export function SubagentOverview({ subAgents }: SubagentOverviewProps) {
  if (subAgents.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="px-4 py-2 bg-slate-800/20 border-b border-slate-700/30 overflow-hidden"
      >
        <div className="flex flex-wrap gap-2">
          {subAgents.map((agent) => {
            const statusBgClass = getStatusBgClass(agent.status);
            const statusTextClass = getStatusTextClass(agent.status);
            const dotClass = getDotClass(agent.status);

            return (
              <motion.div
                key={agent.agentId}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${statusBgClass} ${statusTextClass}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                {agent.role}
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function getStatusBgClass(status: SubAgentInfo['status']): string {
  switch (status) {
    case 'thinking':
      return 'bg-yellow-500/20';
    case 'responding':
      return 'bg-green-500/20';
    case 'using_tool':
      return 'bg-blue-500/20';
    case 'complete':
      return 'bg-emerald-500/20';
    default:
      return 'bg-slate-700/50';
  }
}

function getStatusTextClass(status: SubAgentInfo['status']): string {
  switch (status) {
    case 'thinking':
      return 'text-yellow-400';
    case 'responding':
      return 'text-green-400';
    case 'using_tool':
      return 'text-blue-400';
    case 'complete':
      return 'text-emerald-400';
    default:
      return 'text-slate-400';
  }
}

function getDotClass(status: SubAgentInfo['status']): string {
  switch (status) {
    case 'thinking':
      return 'bg-yellow-400 animate-pulse';
    case 'responding':
      return 'bg-green-400 animate-pulse';
    case 'using_tool':
      return 'bg-blue-400 animate-pulse';
    case 'complete':
      return 'bg-emerald-400';
    default:
      return 'bg-slate-500';
  }
}

export default SubagentOverview;
