import { motion } from 'framer-motion';
import type { AgentRole, AgentStatus } from '../../../shared/types';
import { AGENT_CONFIG } from '../../../shared/agentTypes';
import { isActiveStatus } from '../utils/statusHelpers';

interface AgentAvatarProps {
  role: AgentRole;
  status: AgentStatus;
  size?: 'sm' | 'md' | 'lg';
}

export const AgentAvatar: React.FC<AgentAvatarProps> = ({ role, status, size = 'md' }) => {
  const config = AGENT_CONFIG[role];

  const sizeClasses = {
    sm: 'w-12 h-12 text-2xl',
    md: 'w-16 h-16 text-3xl',
    lg: 'w-20 h-20 text-4xl'
  };

  const isAnimating = isActiveStatus(status);

  return (
    <motion.div
      className={`
        ${sizeClasses[size]}
        rounded-full flex items-center justify-center
        transition-shadow duration-300
      `}
      style={{
        backgroundColor: config.color,
        boxShadow: isAnimating
          ? `0 0 20px ${config.color}80, 0 0 40px ${config.color}40`
          : `0 4px 20px ${config.color}40`
      }}
      animate={isAnimating ? {
        scale: [1, 1.08, 1],
      } : {}}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut'
      }}
    >
      <span className="select-none drop-shadow-lg">{config.emoji}</span>
    </motion.div>
  );
};
