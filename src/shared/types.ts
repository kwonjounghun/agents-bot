// Simplified types for Claude Agent SDK integration

// Message types from SDK responses
export type MessageType = 'text' | 'thinking' | 'tool_use' | 'result' | 'error';

// Agent team types - dynamic, any string role name is allowed
export type AgentRole = string;

export interface AgentWidget {
  id: string;
  role: AgentRole;
  windowId: number;
  position: { x: number; y: number };
  isActive: boolean;
}

export interface AgentTeam {
  id: string;
  name: string;
  agents: AgentWidget[];
  status: 'idle' | 'active' | 'complete';
}

// Widget-specific message
export interface WidgetMessage {
  agentId: string;
  role: AgentRole;
  type: 'thinking' | 'speaking' | 'tool_use' | 'complete';
  content: string;
  timestamp: number;
}

// Simplified agent message for UI display
export interface AgentMessage {
  id: string;
  type: MessageType;
  content: string;
  toolName?: string;
  timestamp: number;
  isStreaming: boolean;
}

// Agent status
export type AgentStatus = 'idle' | 'thinking' | 'responding' | 'using_tool' | 'complete' | 'error';

// Agent state for UI
export interface AgentState {
  status: AgentStatus;
  messages: AgentMessage[];
  currentMessage: string;
  error?: string;
}

// IPC channel types
export interface IPCChannels {
  // Main -> Renderer
  'agent:message': {
    messageId: string;
    chunk: string;
    fullText: string;
    type: MessageType;
    isComplete: boolean;
  };
  'agent:status': { status: AgentStatus };
  'agent:tool-use': { toolName: string; input: string };
  'agent:error': { error: string };
  'agent:result': { result: string; costUsd: number; turns: number };

  // Renderer -> Main
  'control:send-prompt': { prompt: string; workingDirectory?: string };
  'control:stop': void;
}

// SDK Options passed from renderer
export interface QueryOptions {
  prompt: string;
  workingDirectory?: string;
  model?: string;
}

// OMC Status for UI display
export interface OMCStatusInfo {
  installed: boolean;
  version: string | null;
  skillCount: number;
  skills: string[];
  activeModes: string[];
}
