/**
 * Team Tools
 *
 * SDK-OMC Team orchestration tools for coordinated multi-agent execution.
 * Supports both Claude Code native teams and tmux-based CLI workers.
 *
 * Pipeline: team-plan -> team-prd -> team-exec -> team-verify -> team-fix
 */

// Types
export * from './types';

// Utilities
export * from './utils';

// Lifecycle tools
export { teamCreateTool, teamDeleteTool } from './lifecycle';

// Task management tools
export { teamAddTaskTool, teamAssignTaskTool, teamCompleteTaskTool } from './tasks';

// Orchestration tools
export { teamTransitionTool, teamStatusTool, teamSendMessageTool } from './orchestration';

// Import for aggregate export
import type { ToolDefinition } from '../../skills';
import { teamCreateTool, teamDeleteTool } from './lifecycle';
import { teamAddTaskTool, teamAssignTaskTool, teamCompleteTaskTool } from './tasks';
import { teamTransitionTool, teamStatusTool, teamSendMessageTool } from './orchestration';

/**
 * All team tools aggregated for convenience
 */
export const teamTools: ToolDefinition[] = [
  teamCreateTool,
  teamDeleteTool,
  teamAddTaskTool,
  teamAssignTaskTool,
  teamCompleteTaskTool,
  teamTransitionTool,
  teamStatusTool,
  teamSendMessageTool
];
