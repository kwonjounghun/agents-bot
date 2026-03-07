/**
 * StatusRing Component
 * Circular progress indicator for agent status
 */

import React, { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { AgentStatus } from '../../../../shared/types';
import { STATUS_CONFIG, isActiveStatus } from '../../utils/statusHelpers';

interface StatusRingProps {
  status: AgentStatus;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  progress?: number; // 0-100 for determinate progress
}

export const StatusRing = memo(function StatusRing({
  status,
  size = 32,
  strokeWidth = 3,
  showLabel = true,
  progress,
}: StatusRingProps) {
  const config = STATUS_CONFIG[status];
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const isActive = isActiveStatus(status);

  // For determinate progress
  const offset = useMemo(() => {
    if (progress !== undefined) {
      return circumference - (progress / 100) * circumference;
    }
    return 0;
  }, [progress, circumference]);

  // Extract color class for stroke
  const strokeColorClass = useMemo(() => {
    return config?.bgColor?.replace('bg-', 'stroke-') ?? 'stroke-gray-400';
  }, [config?.bgColor]);

  return (
    <div
      className="flex items-center gap-2"
      role="status"
      aria-label={`Status: ${config?.text ?? 'Unknown'}`}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          aria-hidden="true"
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-700"
          />

          {/* Progress/status circle */}
          {progress !== undefined ? (
            // Determinate progress
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              className={strokeColorClass}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          ) : isActive ? (
            // Indeterminate animated progress
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              className={strokeColorClass}
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: 0 }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          ) : (
            // Static complete circle for idle/complete states
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              className={strokeColorClass}
              strokeDasharray={circumference}
              strokeDashoffset={circumference * 0.25}
            />
          )}
        </svg>

        {/* Center dot for non-active states */}
        {!isActive && (
          <div
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${config?.bgColor ?? 'bg-gray-400'}`}
          />
        )}
      </div>

      {showLabel && (
        <span className={`text-xs font-medium ${config?.textColor ?? 'text-gray-400'}`}>
          {config?.text ?? 'Unknown'}
        </span>
      )}
    </div>
  );
});

export default StatusRing;
