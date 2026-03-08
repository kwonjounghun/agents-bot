/**
 * Shared Status Types
 *
 * Agent status types and related utilities.
 */

/**
 * Agent status values
 */
export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'responding'
  | 'using_tool'
  | 'complete'
  | 'error';

/**
 * Status display configuration
 */
export interface StatusConfig {
  text: string;
  color: string;
  bgClass: string;
}

/**
 * Get status display text
 */
export function getStatusText(status: AgentStatus): string {
  switch (status) {
    case 'thinking':
      return 'Thinking...';
    case 'responding':
      return 'Speaking...';
    case 'using_tool':
      return 'Working...';
    case 'complete':
      return 'Done';
    case 'error':
      return 'Error';
    default:
      return 'Ready';
  }
}

/**
 * Get status background color class
 */
export function getStatusColorClass(status: AgentStatus): string {
  switch (status) {
    case 'thinking':
      return 'bg-yellow-400';
    case 'responding':
      return 'bg-green-400';
    case 'using_tool':
      return 'bg-blue-400';
    case 'complete':
      return 'bg-emerald-400';
    case 'error':
      return 'bg-red-400';
    default:
      return 'bg-gray-400';
  }
}

/**
 * Check if status indicates active processing
 */
export function isActiveStatus(status: AgentStatus): boolean {
  return status === 'thinking' || status === 'responding' || status === 'using_tool';
}
