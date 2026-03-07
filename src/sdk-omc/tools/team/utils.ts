/**
 * Team Utilities
 *
 * Utility functions for team orchestration tools.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { TeamStage } from './types';

const TEAM_DIR = 'team';

/**
 * Get team directory path
 */
export function getTeamDirectory(workingDirectory: string): string {
  return path.join(workingDirectory, '.omc', TEAM_DIR);
}

/**
 * Ensure team directory exists
 */
export function ensureTeamDirectory(workingDirectory: string): void {
  const teamDir = getTeamDirectory(workingDirectory);
  if (!fs.existsSync(teamDir)) {
    fs.mkdirSync(teamDir, { recursive: true });
  }
}

/**
 * Generate unique task ID
 */
export function createTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Stage to agent mapping for team pipeline
 */
const STAGE_AGENTS: Record<TeamStage, string[]> = {
  'team-plan': ['explore', 'planner', 'analyst', 'architect'],
  'team-prd': ['analyst', 'critic'],
  'team-exec': ['executor', 'designer', 'build-fixer', 'writer', 'test-engineer', 'deep-executor'],
  'team-verify': ['verifier', 'security-reviewer', 'code-reviewer', 'quality-reviewer'],
  'team-fix': ['executor', 'build-fixer', 'debugger']
};

/**
 * Get agents available for a given pipeline stage
 */
export function getAgentsForStage(stage: TeamStage): string[] {
  return STAGE_AGENTS[stage] || ['executor'];
}
