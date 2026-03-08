/**
 * Sub-agent Data Types
 *
 * Types specific to sub-agent data layer.
 */

import type { AgentRole, AgentStatus, IncomingMessage } from '../../shared';

/**
 * Sub-agent widget parameters from URL
 */
export interface SubagentParams {
  agentId: string;
  role: AgentRole;
}

/**
 * Sub-agent data source handlers
 */
export interface SubagentDataHandlers {
  onMessage: (message: IncomingMessage) => void;
  onStatus: (status: AgentStatus) => void;
  onClose: () => void;
}

/**
 * Widget message received via IPC
 */
export interface SubagentWidgetMessage {
  agentId: string;
  type: IncomingMessage['type'];
  content: string;
  timestamp?: number;
  sectionId?: string;
  isNewSection?: boolean;
}
