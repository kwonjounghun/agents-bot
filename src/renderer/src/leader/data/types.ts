/**
 * Leader Data Types
 *
 * Types specific to leader (parent agent) data layer.
 */

import type { AgentRole, AgentStatus, IncomingMessage } from '../../shared';

/**
 * Leader widget parameters from URL
 */
export interface LeaderParams {
  leaderId: string;
  workingDirectory: string;
}

/**
 * Leader message received via IPC
 */
export interface LeaderMessage {
  type: IncomingMessage['type'];
  content: string;
  timestamp: number;
}

/**
 * Sub-agent status update
 */
export interface SubAgentStatusUpdate {
  agentId: string;
  role: AgentRole;
  status: AgentStatus;
}

/**
 * Leader result data
 */
export interface LeaderResult {
  result: string;
  costUsd: number;
  turns: number;
}

/**
 * Leader data source handlers
 */
export interface LeaderDataHandlers {
  onMessage: (message: IncomingMessage) => void;
  onStatus: (status: AgentStatus) => void;
  onSubAgentStatus: (data: SubAgentStatusUpdate) => void;
  onSubAgentCreated: (data: { agentId: string; role: AgentRole }) => void;
  onSubAgentRemoved: (data: { agentId: string }) => void;
  onResult: (data: LeaderResult) => void;
  onError: (error: string) => void;
}
