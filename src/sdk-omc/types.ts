/**
 * SDK-OMC Type Definitions
 *
 * TypeScript types for the SDK-native OMC implementation.
 * These mirror the core OMC concepts but are designed for SDK usage.
 */

// Model tier types
export type ModelTier = 'haiku' | 'sonnet' | 'opus';
export type ModelType = ModelTier | 'inherit';

// Agent categories
export type AgentCategory =
  | 'exploration'
  | 'planning'
  | 'execution'
  | 'review'
  | 'specialist'
  | 'utility';

// Agent configuration
export interface AgentConfig {
  name: string;
  description: string;
  prompt: string;
  tools?: string[];
  disallowedTools?: string[];
  model?: ModelType;
  category?: AgentCategory;
}

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

// Hook input types
export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: HookEvent;
  prompt?: string;
  tool_name?: string;
  tool_input?: string;
  tool_response?: string;
  agent_id?: string;
  agent_type?: string;
}

export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'UserPromptSubmit'
  | 'SessionStart'
  | 'SessionEnd'
  | 'Stop'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact'
  | 'PermissionRequest'
  | 'Notification';

// Hook output types
export interface HookOutput {
  continue?: boolean;
  suppressOutput?: boolean;
  stopReason?: string;
  systemMessage?: string;
  hookSpecificOutput?: {
    hookEventName?: string;
    additionalContext?: string;
    permissionDecision?: 'allow' | 'deny';
    permissionDecisionReason?: string;
    updatedInput?: Record<string, unknown>;
  };
}

// Detected keyword
export interface DetectedKeyword {
  type: KeywordType;
  keyword: string;
  position: number;
}

export type KeywordType =
  | 'magic-keyword'
  | 'agent-reference'
  | 'skill-keyword'
  | 'directive-keyword';

// SDK-OMC options
export interface OmcSdkOptions {
  enableSkills?: boolean;
  enableAgents?: boolean;
  enableHooks?: boolean;
  workingDirectory?: string;
  debug?: boolean;
}

// Skill execution result
export interface SkillResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

// Model routing configuration
export interface RoutingConfig {
  enabled?: boolean;
  defaultTier?: ModelTier;
  escalationEnabled?: boolean;
  maxEscalations?: number;
  agentOverrides?: Record<string, { tier: ModelTier; reason?: string }>;
  escalationKeywords?: string[];
  simplificationKeywords?: string[];
}

// Team state (for team skill)
export interface TeamState extends ModeState {
  teamName?: string;
  agentCount?: number;
  agentTypes?: string;
  fixLoopCount?: number;
  maxFixLoops?: number;
  stageHistory?: string;
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
