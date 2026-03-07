/**
 * Services Module Index
 *
 * Re-exports all service modules for convenient importing.
 *
 * Usage:
 *   import { createSDKLoader, parseMessage, normalizeAgentType } from './services';
 */

// SDK Loader
export {
  createSDKLoader,
  getDefaultSDKLoader,
  getSDK,
  type SDKLoader,
  type ClaudeAgentSDK
} from './sdkLoader';

// Message Parser
export {
  parseMessage,
  parseTextDelta,
  parseThinkingDelta,
  parseToolUse,
  parseStreamEvent,
  parseAssistantMessage,
  parseResultMessage,
  parseSystemMessage,
  isMessageArray,
  type ParsedMessage,
  type ParsedMessageType
} from './messageParser';

// Prompt Processor
export {
  parseSlashCommand,
  loadSkillDefinition,
  buildFinalPrompt,
  buildOmcAgentContext,
  processOMCCommand,
  type SlashCommand,
  type ProcessedPrompt,
  type OMCInstallation
} from './promptProcessor';

// Hook Builder
export {
  buildBaseHooks,
  mergeHooks,
  buildQueryOptions,
  type AgentStartEvent,
  type AgentStopEvent,
  type HookCallbacks,
  type SDKHooks,
  type QueryParams,
  type QueryOptions
} from './hookBuilder';

// OMC Manager
export {
  createOMCManager,
  type OMCManager,
  type OMCStatus,
  type OMCManagerCallbacks,
  type SdkOmcResult
} from './omcManager';

// Agent Normalizer
export {
  normalizeAgentType,
  createAgentNormalizer,
  getTypeMappings,
  isKnownAgentType,
  DEFAULT_AGENT_TYPE_MAP,
  type AgentRole
} from './agentNormalizer';

// Team State Manager
export {
  createTeamStateManager,
  type TeamStateManager,
  type TeamStateManagerConfig,
  type TeamAgent
} from './teamStateManager';

// Widget Router
export {
  createWidgetRouter,
  type WidgetRouter,
  type WidgetMessage,
  type WidgetMessageType,
  type WidgetManagerInterface,
  type AgentStatus
} from './widgetRouter';
