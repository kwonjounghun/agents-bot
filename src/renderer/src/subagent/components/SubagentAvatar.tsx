/**
 * SubagentAvatar Component
 *
 * Avatar with sub-agent specific styling including glow effect and pulse ring.
 */

import { motion } from 'framer-motion';
import type { AgentRole, AgentStatus } from '../../shared';
import { isActiveStatus } from '../../shared';
import { AGENT_CONFIG } from '../../../../shared/agentTypes';

interface SubagentAvatarProps {
  role: AgentRole;
  status: AgentStatus;
  size?: 'sm' | 'md' | 'lg';
}

const sizeConfig = {
  sm: { container: 'w-10 h-10', emoji: 'text-lg' },
  md: { container: 'w-12 h-12', emoji: 'text-xl' },
  lg: { container: 'w-14 h-14', emoji: 'text-2xl' }
};

export function SubagentAvatar({ role, status, size = 'lg' }: SubagentAvatarProps) {
  const config = AGENT_CONFIG[role] || AGENT_CONFIG['executor'];
  const sizeStyles = sizeConfig[size];
  const isActive = isActiveStatus(status);

  return (
    <motion.div
      className="relative"
      animate={
        isActive
          ? {
              filter: [
                'drop-shadow(0 0 8px rgba(255,255,255,0.3))',
                'drop-shadow(0 0 16px rgba(255,255,255,0.5))',
                'drop-shadow(0 0 8px rgba(255,255,255,0.3))'
              ]
            }
          : {}
      }
      transition={{ duration: 2, repeat: Infinity }}
    >
      {/* Main Avatar */}
      <div
        className={`${sizeStyles.container} rounded-full flex items-center justify-center shadow-lg`}
        style={{
          backgroundColor: config.color,
          boxShadow: `0 4px 14px ${config.color}40`
        }}
      >
        <span className={sizeStyles.emoji}>{config.emoji}</span>
      </div>

      {/* Pulse Ring when active */}
      {isActive && (
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-white/30"
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
}

export default SubagentAvatar;
