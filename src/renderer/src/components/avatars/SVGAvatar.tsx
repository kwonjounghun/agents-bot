/**
 * SVGAvatar Component
 * Custom SVG-based avatars for each agent role with status animations
 */

import React, { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { AgentRole, AgentStatus } from '../../../../shared/types';
import { getAgentConfig } from '../../../../shared/agentTypes';
import { isActiveStatus } from '../../utils/statusHelpers';

interface SVGAvatarProps {
  role: AgentRole;
  status: AgentStatus;
  size?: 'sm' | 'md' | 'lg';
  showRing?: boolean;
}

const SIZE_MAP = {
  sm: { container: 48, icon: 20, ring: 56 },
  md: { container: 64, icon: 28, ring: 72 },
  lg: { container: 80, icon: 36, ring: 88 },
};

// Agent-specific SVG icon paths
const AGENT_ICONS: Record<string, string> = {
  planner: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  executor: 'M13 10V3L4 14h7v7l9-11h-7z',
  reviewer: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  designer: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
  debugger: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  architect: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  analyst: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  explorer: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
  verifier: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  writer: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  'test-engineer': 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
  'security-reviewer': 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  'build-fixer': 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
};

// Default icon for unknown roles
const DEFAULT_ICON = 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z';

export const SVGAvatar = memo(function SVGAvatar({
  role,
  status,
  size = 'md',
  showRing = true,
}: SVGAvatarProps) {
  const config = getAgentConfig(role);
  const dimensions = SIZE_MAP[size];
  const isActive = isActiveStatus(status);

  const iconPath = useMemo(() => {
    const normalizedRole = role.toLowerCase().replace(/\s+/g, '-');
    return AGENT_ICONS[normalizedRole] || DEFAULT_ICON;
  }, [role]);

  const avatarStyle = useMemo(() => ({
    backgroundColor: config.color,
    boxShadow: isActive
      ? `0 0 20px ${config.color}80, 0 0 40px ${config.color}40`
      : `0 4px 20px ${config.color}40`,
  }), [config.color, isActive]);

  const ringRadius = (dimensions.ring - 4) / 2;
  const circumference = 2 * Math.PI * ringRadius;

  return (
    <div
      className="relative"
      style={{ width: dimensions.ring, height: dimensions.ring }}
      role="img"
      aria-label={`${config.name} agent, status: ${status}`}
    >
      {/* Status Ring */}
      {showRing && (
        <svg
          className="absolute inset-0"
          width={dimensions.ring}
          height={dimensions.ring}
          viewBox={`0 0 ${dimensions.ring} ${dimensions.ring}`}
          aria-hidden="true"
        >
          {/* Background ring */}
          <circle
            cx={dimensions.ring / 2}
            cy={dimensions.ring / 2}
            r={ringRadius}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-slate-700"
          />
          {/* Animated progress ring */}
          {isActive && (
            <motion.circle
              cx={dimensions.ring / 2}
              cy={dimensions.ring / 2}
              r={ringRadius}
              fill="none"
              stroke={config.color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * 0.75}
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              style={{ transformOrigin: 'center' }}
            />
          )}
        </svg>
      )}

      {/* Avatar circle */}
      <motion.div
        className="absolute rounded-full flex items-center justify-center"
        style={{
          top: (dimensions.ring - dimensions.container) / 2,
          left: (dimensions.ring - dimensions.container) / 2,
          width: dimensions.container,
          height: dimensions.container,
          ...avatarStyle,
        }}
        animate={isActive ? { scale: [1, 1.05, 1] } : {}}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        <svg
          width={dimensions.icon}
          height={dimensions.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="drop-shadow-lg"
          aria-hidden="true"
        >
          <path d={iconPath} />
        </svg>
      </motion.div>
    </div>
  );
});

export default SVGAvatar;
