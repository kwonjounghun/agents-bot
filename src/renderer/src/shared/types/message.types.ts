/**
 * Shared Message Types
 *
 * Common message interfaces used by both sub-agent and parent agent widgets.
 */

/**
 * Message types that can be received from IPC
 */
export type WidgetMessageType =
  | 'thinking'
  | 'speaking'
  | 'tool_use'
  | 'tool_result'
  | 'complete'
  | 'error';

/**
 * Incoming message from IPC channel
 * Generic format that both widget types can use
 */
export interface IncomingMessage {
  type: WidgetMessageType;
  content: string;
  timestamp?: number;
  sectionId?: string;
  isNewSection?: boolean;
  toolName?: string;
}

/**
 * Accumulated speech message for display
 * Represents a section of accumulated content
 */
export interface SpeechMessage {
  id: string;
  type: 'thinking' | 'speaking' | 'tool_use' | 'tool_result';
  content: string;
  timestamp: number;
  isComplete: boolean;
  toolName?: string;
}

/**
 * Widget message sent via IPC from main process
 */
export interface WidgetMessage {
  agentId: string;
  role: string;
  type: WidgetMessageType;
  content: string;
  timestamp: number;
  sectionId?: string;
  isNewSection?: boolean;
  toolName?: string;
  toolUseId?: string;
}
