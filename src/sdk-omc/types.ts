/**
 * SDK-OMC Type Definitions
 *
 * Types retained for persistent mode execution and state management.
 */

// Model tier (used by PersistentModeConfig)
export type ModelTier = 'haiku' | 'sonnet' | 'opus';

// Skill modes
export type SkillMode =
  | 'autopilot'
  | 'ralph'
  | 'team'
  | 'ultrawork'
  | 'ultrapilot'
  | 'pipeline'
  | 'plan';

// State management
export interface ModeState {
  active: boolean;
  iteration?: number;
  maxIterations?: number;
  currentPhase?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  taskDescription?: string;
  linkedTeam?: boolean;
  linkedRalph?: boolean;
  [key: string]: unknown;
}

// Stage history entry for team pipeline
export interface StageHistoryEntry {
  stage: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed';
}

// Team state (for team skill)
export interface TeamState extends ModeState {
  teamName?: string;
  agentCount?: number;
  agentTypes?: string;
  fixLoopCount?: number;
  maxFixLoops?: number;
  stageHistory?: string | StageHistoryEntry[];
}

// Ralph state (for ralph skill)
export interface RalphState extends ModeState {
  linkedTeam?: boolean;
  teamName?: string;
}

// Autopilot state
export interface AutopilotState extends ModeState {
  goal?: string;
  planPath?: string;
}

// Persistent mode configuration
export interface PersistentModeConfig {
  maxIterations: number;
  checkCompletionAfterEachIteration: boolean;
  requireVerification: boolean;
  verificationModel: ModelTier;
  continuePrompt: string;
  completionPatterns: RegExp[];
  failurePatterns: RegExp[];
}

// Execution result from persistent mode
export interface ExecutionResult {
  success: boolean;
  mode: SkillMode;
  iterations: number;
  duration?: number;
  finalResponse?: string;
  error?: string;
}

// Completion check result
export interface CompletionCheckResult {
  isComplete: boolean;
  isBlocked?: boolean;
  reason?: string;
  confidence?: number;
}

// Persistent mode events
export interface PersistentModeEvents {
  modeStarted: { mode: SkillMode; task: string; state: ModeState };
  modeCompleted: { mode: SkillMode; iteration: number; verified: boolean };
  modeEnded: { mode: SkillMode; iterations: number };
  iterationStarted: { mode: SkillMode; iteration: number; maxIterations: number };
  iterationCompleted: { mode: SkillMode; iteration: number; result: unknown };
  completionChecked: { mode: SkillMode; iteration: number; checkResult: CompletionCheckResult };
  verificationStarted: { mode: SkillMode };
  verificationCompleted: { mode: SkillMode; approved: boolean; response: string };
  verificationFailed: { mode: SkillMode; iteration: number };
  verificationError: { mode: SkillMode; error: unknown };
  stopRequested: Record<string, never>;
}
