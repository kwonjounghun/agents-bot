/**
 * ThinkingDots Component
 *
 * Animated bouncing dots indicating thinking/processing state.
 * Pure presentational component.
 */

import { motion } from 'framer-motion';

interface ThinkingDotsProps {
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeConfig = {
  sm: { dot1: 'w-1.5 h-1.5', dot2: 'w-2 h-2', dot3: 'w-2.5 h-2.5', gap: 'gap-0.5' },
  md: { dot1: 'w-2 h-2', dot2: 'w-2.5 h-2.5', dot3: 'w-3 h-3', gap: 'gap-1' },
  lg: { dot1: 'w-2.5 h-2.5', dot2: 'w-3 h-3', dot3: 'w-3.5 h-3.5', gap: 'gap-1.5' }
};

export function ThinkingDots({ color = 'bg-white/50', size = 'md' }: ThinkingDotsProps) {
  const config = sizeConfig[size];

  return (
    <div className={`flex items-center ${config.gap}`}>
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
        className={`rounded-full ${config.dot1} ${color} opacity-40`}
      />
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
        className={`rounded-full ${config.dot2} ${color} opacity-50`}
      />
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
        className={`rounded-full ${config.dot3} ${color} opacity-60`}
      />
    </div>
  );
}

export default ThinkingDots;
