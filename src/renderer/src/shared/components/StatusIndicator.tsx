/**
 * StatusIndicator Component
 *
 * Renders a colored status dot with optional pulse animation.
 * Pure presentational component.
 */

import { motion } from 'framer-motion';
import type { AgentStatus } from '../types';
import { getStatusColorClass, isActiveStatus } from '../types';

interface StatusIndicatorProps {
  status: AgentStatus;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
}

const sizeClasses = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-3 h-3'
};

export function StatusIndicator({ status, size = 'md', animate = true }: StatusIndicatorProps) {
  const colorClass = getStatusColorClass(status);
  const sizeClass = sizeClasses[size];
  const shouldAnimate = animate && isActiveStatus(status);

  if (shouldAnimate) {
    return (
      <motion.div
        className={`rounded-full ${sizeClass} ${colorClass}`}
        animate={{ scale: [1, 1.3, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
    );
  }

  return <div className={`rounded-full ${sizeClass} ${colorClass}`} />;
}

export default StatusIndicator;
