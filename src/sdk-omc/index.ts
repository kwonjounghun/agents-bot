/**
 * SDK-OMC Integration Entry Point
 *
 * Main entry point for using oh-my-claudecode features with the Claude Agent SDK.
 * Provides a unified API for registering agents, skills, and hooks.
 */

import { omcAgents, getAgent, listAgentNames, type AgentDefinition } from './agents';
import { omcSkillTools, getSkillTool, listSkillToolNames, type ToolDefinition } from './skills';
import {
  createOmcHooks,
  mergeHooks,
  detectKeywordsWithType,
  detectMagicKeywords,
  type HookCallback
} from './hooks';
import {
  getModelForAgent,
  routeModel,
  routeModelByComplexity,
  defaultRoutingConfig,
  type RoutingConfig
} from './routing';
import {
  readState,
  writeState,
  clearState,
  listActiveModes,
  hasActiveModes,
  getModeStatus
} from './state';
import type { OmcSdkOptions, SkillMode, ModeState, ModelTier } from './types';

// Re-export types
export * from './types';

// Re-export modules
export { omcAgents, getAgent, listAgentNames } from './agents';
export { omcSkillTools, getSkillTool, listSkillToolNames } from './skills';
export {
  createOmcHooks,
  mergeHooks,
  detectKeywordsWithType,
  detectMagicKeywords,
  keywordDetectionHook,
  modeProtectionHook,
  coordinationHook,
  sessionStartHook
} from './hooks';
export {
  getModelForAgent,
  routeModel,
  routeModelByComplexity,
  defaultRoutingConfig,
  MODEL_TIER_INFO
} from './routing';
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

// Export additional tools
export { lspTools } from './tools/lsp-tools';
export { traceTools } from './tools/trace-tools';
export { memoryTools } from './tools/memory-tools';
export { notepadTools } from './tools/notepad-tools';
export { astTools } from './tools/ast-tools';
export { teamTools } from './tools/team-tools';
export { allAdditionalTools } from './tools';

// Export team orchestrator
export {
  TEAM_PIPELINE,
  getStageConfig,
  getNextStage,
  getStageAgentsWithModels,
  createAgentTaskCall,
  generateStagePrompt,
  createOrchestrationInstructions,
  DEFAULT_ORCHESTRATOR_CONFIG
} from './tools/team-orchestrator';

/**
 * SDK Query Options type (partial, for our usage)
 */
interface SdkQueryOptions {
  agents?: Record<string, AgentDefinition>;
  mcpServers?: Record<string, unknown>;
  hooks?: Record<string, Array<{ hooks: HookCallback[] }>>;
  allowedTools?: string[];
  disallowedTools?: string[];
  permissionMode?: string;
  model?: string;
  cwd?: string;
}

/**
 * Create SDK query options with OMC features enabled
 */
export function createOmcQueryOptions(options: OmcSdkOptions = {}): Partial<SdkQueryOptions> {
  const queryOptions: Partial<SdkQueryOptions> = {};

  // Register agents
  if (options.enableAgents !== false) {
    queryOptions.agents = omcAgents;
  }

  // Register hooks
  if (options.enableHooks !== false) {
    queryOptions.hooks = createOmcHooks();
  }

  // Base allowed tools
  queryOptions.allowedTools = [
    'Task', // Required for subagents
    'Read',
    'Edit',
    'Write',
    'Bash',
    'Grep',
    'Glob'
  ];

  // Add skill tools if enabled
  if (options.enableSkills !== false) {
    const skillToolNames = listSkillToolNames().map(name => `mcp__omc-skills__${name}`);
    queryOptions.allowedTools = [...queryOptions.allowedTools, ...skillToolNames];
  }

  // Set working directory
  if (options.workingDirectory) {
    queryOptions.cwd = options.workingDirectory;
  }

  return queryOptions;
}

/**
 * Create MCP server configuration for skills
 *
 * Note: This returns the tool definitions. In the actual SDK usage,
 * you would use createSdkMcpServer() to create the server.
 */
export function createOmcSkillsServer(): {
  name: string;
  version: string;
  tools: ToolDefinition[];
} {
  return {
    name: 'omc-skills',
    version: '1.0.0',
    tools: omcSkillTools
  };
}

/**
 * Initialize SDK-OMC for a session
 */
export async function initializeOmc(
  workingDirectory: string,
  options: OmcSdkOptions = {}
): Promise<{
  success: boolean;
  activeModes: SkillMode[];
  agents: string[];
  skills: string[];
}> {
  try {
    // Check for active modes
    const activeModes = await listActiveModes(workingDirectory);

    // Get available agents and skills
    const agents = listAgentNames();
    const skills = listSkillToolNames();

    if (options.debug) {
      console.log('[SDK-OMC] Initialized');
      console.log(`  Working directory: ${workingDirectory}`);
      console.log(`  Active modes: ${activeModes.join(', ') || 'none'}`);
      console.log(`  Available agents: ${agents.length}`);
      console.log(`  Available skills: ${skills.length}`);
    }

    return {
      success: true,
      activeModes,
      agents,
      skills
    };
  } catch (error) {
    console.error('[SDK-OMC] Initialization error:', error);
    return {
      success: false,
      activeModes: [],
      agents: listAgentNames(),
      skills: listSkillToolNames()
    };
  }
}

/**
 * Get OMC status for a session
 */
export async function getOmcStatus(workingDirectory: string): Promise<{
  installed: boolean;
  version: string;
  activeModes: SkillMode[];
  agents: string[];
  skills: string[];
}> {
  const activeModes = await listActiveModes(workingDirectory);

  return {
    installed: true,
    version: '1.0.0-sdk',
    activeModes,
    agents: listAgentNames(),
    skills: listSkillToolNames()
  };
}

/**
 * Process prompt for OMC keywords and return enriched context
 */
export function processOmcPrompt(prompt: string): {
  originalPrompt: string;
  detectedKeywords: ReturnType<typeof detectKeywordsWithType>;
  suggestedMode: SkillMode | null;
  suggestedAgent: string | null;
  modelTier: ModelTier;
} {
  const keywords = detectKeywordsWithType(prompt);

  // Find suggested mode from magic keywords
  const modeKeyword = keywords.find(k => k.type === 'magic-keyword' || k.type === 'skill-keyword');
  const suggestedMode = modeKeyword ? (modeKeyword.keyword as SkillMode) : null;

  // Find suggested agent from references
  const agentRef = keywords.find(k => k.type === 'agent-reference');
  const suggestedAgent = agentRef ? agentRef.keyword : null;

  // Determine model tier
  const modelTier = routeModelByComplexity(prompt);

  return {
    originalPrompt: prompt,
    detectedKeywords: keywords,
    suggestedMode,
    suggestedAgent,
    modelTier
  };
}

/**
 * Helper to create agent definition with model routing
 */
export function createRoutedAgent(
  baseName: string,
  overrides?: Partial<AgentDefinition>
): AgentDefinition | null {
  const baseAgent = getAgent(baseName);
  if (!baseAgent) {
    return null;
  }

  const model = getModelForAgent(baseName);

  return {
    ...baseAgent,
    model,
    ...overrides
  };
}

/**
 * SDK-OMC version info
 */
export const SDK_OMC_VERSION = '1.0.0';
export const SDK_OMC_NAME = 'sdk-omc';

/**
 * Default export for convenient importing
 */
export default {
  // Core functions
  createOmcQueryOptions,
  createOmcSkillsServer,
  initializeOmc,
  getOmcStatus,
  processOmcPrompt,
  createRoutedAgent,

  // Agents
  omcAgents,
  getAgent,
  listAgentNames,

  // Skills
  omcSkillTools,
  getSkillTool,
  listSkillToolNames,

  // Hooks
  createOmcHooks,
  mergeHooks,
  detectKeywordsWithType,

  // Routing
  getModelForAgent,
  routeModel,
  routeModelByComplexity,

  // State
  readState,
  writeState,
  clearState,
  listActiveModes,
  hasActiveModes,
  getModeStatus,

  // Version
  version: SDK_OMC_VERSION,
  name: SDK_OMC_NAME
};
