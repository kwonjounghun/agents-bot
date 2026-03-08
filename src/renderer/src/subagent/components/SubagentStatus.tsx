/**
 * SubagentStatus Component
 *
 * Status indicator with role badge for sub-agent widgets.
 */

import { motion } from 'framer-motion';
import type { AgentRole, AgentStatus } from '../../shared';
import { StatusIndicator, getStatusText } from '../../shared';
import { AGENT_CONFIG } from '../../../../shared/agentTypes';

interface SubagentStatusProps {
  role: AgentRole;
  status: AgentStatus;
}

export function SubagentStatus({ role, status }: SubagentStatusProps) {
  const config = AGENT_CONFIG[role] || AGENT_CONFIG['executor'];

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Role Badge */}
      <motion.div
        className="px-3 py-1 rounded-full text-xs font-medium text-white shadow-lg"
        style={{
          backgroundColor: `${config.color}CC`,
          boxShadow: `0 2px 10px ${config.color}40`
        }}
      >
        {config.name}
      </motion.div>

      {/* Status Indicator */}
      <div className="flex items-center gap-1.5">
        <StatusIndicator status={status} size="md" />
        <span className="text-xs text-white/60">{getStatusText(status)}</span>
      </div>
    </div>
  );
}

export default SubagentStatus;
