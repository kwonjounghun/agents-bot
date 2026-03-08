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
