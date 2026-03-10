/**
 * Shared status helper utilities
 * Eliminates duplicate getStatusText/getStatusColor functions across components
 */

import type { AgentStatus } from '../../../shared/types';

export interface StatusConfig {
  text: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
}

export const STATUS_CONFIG: Record<AgentStatus, StatusConfig> = {
  idle: {
    text: 'Ready',
    color: 'gray',
    bgColor: 'bg-gray-400',
    borderColor: 'border-gray-400',
    textColor: 'text-gray-400'
  },
  thinking: {
    text: 'Thinking...',
    color: 'yellow',
    bgColor: 'bg-yellow-400',
    borderColor: 'border-yellow-400',
    textColor: 'text-yellow-400'
  },
  responding: {
    text: 'Responding...',
    color: 'green',
    bgColor: 'bg-green-400',
    borderColor: 'border-green-400',
    textColor: 'text-green-400'
  },
  using_tool: {
    text: 'Working...',
    color: 'blue',
    bgColor: 'bg-blue-400',
    borderColor: 'border-blue-400',
    textColor: 'text-blue-400'
  },
  complete: {
    text: 'Complete',
    color: 'emerald',
    bgColor: 'bg-emerald-400',
    borderColor: 'border-emerald-400',
    textColor: 'text-emerald-400'
  },
  error: {
    text: 'Error',
    color: 'red',
    bgColor: 'bg-red-400',
    borderColor: 'border-red-400',
    textColor: 'text-red-400'
  },
  stopped: {
    text: 'Stopped',
    color: 'orange',
    bgColor: 'bg-orange-400',
    borderColor: 'border-orange-400',
    textColor: 'text-orange-400'
  }
};

/**
 * Get human-readable status text
 */
export function getStatusText(status: AgentStatus, toolName?: string | null): string {
  if (status === 'using_tool' && toolName) {
    return `Using ${toolName}...`;
  }
  return STATUS_CONFIG[status]?.text ?? 'Ready';
}

/**
 * Get Tailwind background color class for status
 */
export function getStatusBgColor(status: AgentStatus): string {
  return STATUS_CONFIG[status]?.bgColor ?? 'bg-gray-400';
}

/**
 * Get Tailwind text color class for status
 */
export function getStatusTextColor(status: AgentStatus): string {
  return STATUS_CONFIG[status]?.textColor ?? 'text-gray-400';
}

/**
 * Get Tailwind border color class for status
 */
export function getStatusBorderColor(status: AgentStatus): string {
  return STATUS_CONFIG[status]?.borderColor ?? 'border-gray-400';
}

/**
 * Check if status indicates active processing
 */
export function isActiveStatus(status: AgentStatus): boolean {
  return status === 'thinking' || status === 'responding' || status === 'using_tool';
}

/**
 * Check if status should trigger animation
 */
export function shouldAnimate(status: AgentStatus): boolean {
  return status !== 'idle' && status !== 'complete';
}

/**
 * Get Tailwind classes for a team-level status badge (bg + border + text)
 */
export function getTeamStatusStyle(status: string): string {
  switch (status) {
    case 'active': return 'bg-green-900/30 border-green-700/50 text-green-400';
    case 'complete': return 'bg-blue-900/30 border-blue-700/50 text-blue-400';
    default: return 'bg-slate-700/30 border-slate-600/50 text-slate-400';
  }
}

/**
 * Get Tailwind border+shadow classes for agent panel based on status
 */
export function getPanelBorderClass(status: AgentStatus): string {
  switch (status) {
    case 'thinking': return 'border-yellow-500/50 shadow-yellow-500/20';
    case 'responding': return 'border-green-500/50 shadow-green-500/20';
    case 'using_tool': return 'border-blue-500/50 shadow-blue-500/20';
    case 'complete': return 'border-emerald-500/50';
    case 'error': return 'border-red-500/50';
    case 'stopped': return 'border-orange-500/50 shadow-orange-500/20';
    default: return 'border-slate-600/50';
  }
}
