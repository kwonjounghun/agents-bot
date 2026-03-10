/**
 * StatusDisplay Component
 * Single Responsibility: Display agent status indicator
 *
 * This component shows:
 * - Status indicator dot with color
 * - Status text
 * - Optional tool use information
 *
 * Usage:
 *   <StatusDisplay status="thinking" currentToolUse={null} />
 */

import type { AgentStatus } from '../../../shared/types';
import { getStatusText } from '../utils/statusHelpers';

export interface StatusDisplayProps {
  /**
   * Current agent status.
   */
  status: AgentStatus;

  /**
   * Name of the tool currently being used (if any).
   */
  currentToolUse: string | null;
}

/**
 * Get the status indicator color class.
 *
 * @param status - Current agent status
 * @returns Tailwind CSS class for the indicator color
 */
export function getStatusColor(status: AgentStatus): string {
  switch (status) {
    case 'thinking':
      return 'bg-yellow-500';
    case 'responding':
      return 'bg-green-500';
    case 'using_tool':
      return 'bg-blue-500';
    case 'complete':
      return 'bg-emerald-500';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-gray-400';
  }
}

/**
 * Check if status should animate (pulse).
 */
export function shouldAnimate(status: AgentStatus): boolean {
  return status !== 'idle' && status !== 'complete' && status !== 'error';
}

/**
 * StatusDisplay component shows the current agent status.
 */
export function StatusDisplay({ status, currentToolUse }: StatusDisplayProps) {
  const colorClass = getStatusColor(status);
  const text = getStatusText(status, currentToolUse);
  const animate = shouldAnimate(status);

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${colorClass} ${animate ? 'animate-pulse' : ''}`}
      />
      <span className="text-white/60 text-xs">{text}</span>
    </div>
  );
}

export default StatusDisplay;
