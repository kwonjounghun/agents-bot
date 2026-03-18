/**
 * SDK-OMC - Minimal barrel export
 *
 * With settingSources: ["user", "project"], the SDK automatically loads
 * agents, hooks, skills, and CLAUDE.md from the filesystem.
 * Only state management, executor, and types are retained for app-specific needs.
 */

// Types (used by persistentModeService, claudeAgentService)
export type { SkillMode, ModeState, ExecutionResult } from './types';

// State management (used by persistent mode executor)
export {
  readState,
  writeState,
  clearState,
  listActiveModes,
  hasActiveModes,
  getModeStatus,
  createAutopilotState,
  createRalphState,
  createTeamState,
  incrementIteration,
  updatePhase,
  completeMode,
  failMode
} from './state';

// Persistent mode executor (used by persistentModeService)
export {
  PersistentModeExecutor,
  createPersistentModeExecutor,
  DEFAULT_CONFIG as DEFAULT_EXECUTOR_CONFIG
} from './executor';
