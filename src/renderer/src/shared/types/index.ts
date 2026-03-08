/**
 * Shared Types - Public Exports
 */

// Message types
export type {
  WidgetMessageType,
  IncomingMessage,
  SpeechMessage,
  WidgetMessage
} from './message.types';

// Status types
export type { AgentStatus, StatusConfig } from './status.types';
export { getStatusText, getStatusColorClass, isActiveStatus } from './status.types';

// Agent types
export type { AgentRole, AgentConfig, SubAgentInfo } from './agent.types';
