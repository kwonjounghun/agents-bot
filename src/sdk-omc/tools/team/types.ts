/**
 * Team Types
 *
 * Type definitions for team orchestration tools.
 */

/**
 * Team member definition
 */
export interface TeamMember {
  name: string;
  role: string;
  agentType: string;
  status: 'idle' | 'working' | 'completed' | 'failed';
  currentTask?: string;
}

/**
 * Team task definition
 */
export interface TeamTask {
  id: string;
  title: string;
  description: string;
  assignee?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  stage: TeamStage;
  createdAt: string;
  completedAt?: string;
  result?: string;
}

/**
 * Team pipeline stages
 */
export type TeamStage =
  | 'team-plan'
  | 'team-prd'
  | 'team-exec'
  | 'team-verify'
  | 'team-fix';

/**
 * Team state (with index signature for ModeState compatibility)
 */
export interface TeamState {
  [key: string]: unknown;
  active: boolean;
  teamName: string;
  startedAt: string;
  currentPhase: TeamStage;
  taskDescription: string;
  members: TeamMember[];
  tasks: TeamTask[];
  fixLoopCount: number;
  maxFixLoops: number;
  linkedRalph?: boolean;
  stageHistory: Array<{
    stage: TeamStage;
    startedAt: string;
    completedAt?: string;
    status: 'running' | 'completed' | 'failed';
  }>;
}
