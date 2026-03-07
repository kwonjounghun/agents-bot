/**
 * StreamRouter Service
 * Single Responsibility: Route SDK stream messages to the correct agent widget
 *
 * This module handles:
 * - Tracking active agent context via a stack (for nested agent support)
 * - Routing messages to the currently active agent's widget
 * - Managing widget lifecycle (create on start, auto-close on complete)
 *
 * Architecture:
 *   SDK Stream → ClaudeAgentService → StreamRouter → WidgetManager → Widget
 */

import type { WidgetManager } from '../widgetManager';
import type { AgentRole, WidgetMessage, AgentStatus } from '../../shared/types';

// Agent type normalization (from oh-my-claudecode:xxx to xxx)
const AGENT_TYPE_PREFIX = 'oh-my-claudecode:';

/**
 * Represents an active agent context in the execution stack
 */
export interface AgentContext {
  agentId: string;
  agentType: string;
  normalizedRole: AgentRole;
  startTime: number;
  isTeamMember: boolean;
  /** Tool use ID that spawned this agent (for message routing) */
  toolUseId?: string;
  /** Current section tracking for accumulated messages */
  currentSection?: {
    id: string;
    type: WidgetMessageType;
  };
}

/**
 * Message types that can be routed to widgets
 */
export type WidgetMessageType = 'thinking' | 'speaking' | 'tool_use' | 'complete';

/**
 * Configuration for StreamRouter
 */
export interface StreamRouterConfig {
  /** Delay in ms before auto-closing widget after completion (default: 3000) */
  autoCloseDelayMs: number;
  /** Maximum number of agents in the context stack (default: 10) */
  maxContextDepth: number;
}

const DEFAULT_CONFIG: StreamRouterConfig = {
  autoCloseDelayMs: 3000,
  maxContextDepth: 10,
};

/**
 * Normalizes SDK agent type to a simple role name
 * e.g., "oh-my-claudecode:executor" -> "executor"
 * e.g., "Explore" -> "explore"
 */
export function normalizeAgentType(agentType: string): AgentRole {
  if (!agentType) return 'executor';

  // Remove oh-my-claudecode: prefix if present
  let normalized = agentType;
  if (normalized.startsWith(AGENT_TYPE_PREFIX)) {
    normalized = normalized.slice(AGENT_TYPE_PREFIX.length);
  }

  // Convert to lowercase for consistent matching
  normalized = normalized.toLowerCase();

  // Map SDK built-in agent types to our agent types
  const agentTypeMap: Record<string, AgentRole> = {
    'general-purpose': 'executor',
    'general': 'executor',
    'default': 'executor',
    'plan': 'planner',
    'bash': 'executor',
    'explorer': 'explore',
  };

  if (agentTypeMap[normalized]) {
    return agentTypeMap[normalized];
  }

  return normalized;
}

/**
 * StreamRouter manages the routing of SDK stream messages to agent widgets.
 * It maintains a context stack to track which agent is currently active,
 * enabling correct message routing even with nested agent execution.
 */
export class StreamRouter {
  private contextStack: AgentContext[] = [];
  private widgetManager: WidgetManager | null = null;
  private config: StreamRouterConfig;
  private autoCloseTimers: Map<string, NodeJS.Timeout> = new Map();
  /** Map of toolUseId -> agentId for routing subagent messages */
  private toolUseIdToAgentId: Map<string, string> = new Map();

  constructor(config: Partial<StreamRouterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the WidgetManager instance for routing messages
   */
  setWidgetManager(widgetManager: WidgetManager): void {
    this.widgetManager = widgetManager;
  }

  /**
   * Push a new agent context onto the stack (called on SubagentStart)
   * Creates a widget for the agent if WidgetManager is available
   */
  async pushContext(
    agentId: string,
    agentType: string,
    isTeamMember: boolean = false,
    toolUseId?: string
  ): Promise<AgentContext> {
    // Prevent stack overflow
    if (this.contextStack.length >= this.config.maxContextDepth) {
      console.warn(
        `[StreamRouter] Context stack depth limit reached (${this.config.maxContextDepth}). ` +
        `Ignoring nested agent: ${agentType}`
      );
      // Return a dummy context but don't push
      return {
        agentId,
        agentType,
        normalizedRole: normalizeAgentType(agentType),
        startTime: Date.now(),
        isTeamMember,
        toolUseId,
      };
    }

    const normalizedRole = normalizeAgentType(agentType);
    const context: AgentContext = {
      agentId,
      agentType,
      normalizedRole,
      startTime: Date.now(),
      isTeamMember,
      toolUseId,
    };

    this.contextStack.push(context);

    // Store toolUseId -> agentId mapping for message routing
    if (toolUseId) {
      this.toolUseIdToAgentId.set(toolUseId, agentId);
      console.log(`[StreamRouter] Mapped toolUseId ${toolUseId} -> agentId ${agentId}`);
    }

    // Create widget for this agent
    if (this.widgetManager) {
      const index = this.widgetManager.getWidgetCount();
      await this.widgetManager.createWidget(agentId, normalizedRole, index);

      // Send initial thinking status
      this.widgetManager.sendStatusToWidget(agentId, 'thinking');
    }

    console.log(
      `[StreamRouter] Agent started: ${normalizedRole} (${agentId}), ` +
      `stack depth: ${this.contextStack.length}`
    );

    return context;
  }

  /**
   * Pop an agent context from the stack (called on SubagentStop)
   * Schedules auto-close for the widget after delay
   */
  popContext(agentId: string): AgentContext | undefined {
    const idx = this.contextStack.findIndex((c) => c.agentId === agentId);

    if (idx < 0) {
      console.warn(`[StreamRouter] Agent not found in stack: ${agentId}`);
      return undefined;
    }

    const [context] = this.contextStack.splice(idx, 1);

    // Clean up toolUseId mapping
    if (context.toolUseId) {
      this.toolUseIdToAgentId.delete(context.toolUseId);
      console.log(`[StreamRouter] Removed toolUseId mapping: ${context.toolUseId}`);
    }

    // Reset current section
    context.currentSection = undefined;

    // Mark widget as complete
    if (this.widgetManager) {
      this.widgetManager.sendStatusToWidget(agentId, 'complete');
      this.widgetManager.sendMessageToWidget({
        agentId,
        role: context.normalizedRole,
        type: 'complete',
        content: 'Task completed',
        timestamp: Date.now(),
        isNewSection: true, // Mark as new section for completion
      });

      // Schedule auto-close after delay
      this.scheduleAutoClose(agentId);
    }

    console.log(
      `[StreamRouter] Agent stopped: ${context.normalizedRole} (${agentId}), ` +
      `stack depth: ${this.contextStack.length}`
    );

    return context;
  }

  /**
   * Get the currently active agent (top of stack)
   */
  getCurrentAgent(): AgentContext | null {
    if (this.contextStack.length === 0) {
      return null;
    }
    return this.contextStack[this.contextStack.length - 1];
  }

  /**
   * Get all active agents
   */
  getAllAgents(): AgentContext[] {
    return [...this.contextStack];
  }

  /**
   * Check if an agent is in the context stack
   */
  hasAgent(agentId: string): boolean {
    return this.contextStack.some((c) => c.agentId === agentId);
  }

  /**
   * Get agent context by ID
   */
  getAgentContext(agentId: string): AgentContext | undefined {
    return this.contextStack.find((c) => c.agentId === agentId);
  }

  /**
   * Get agent context by toolUseId (parent_tool_use_id from SDK messages)
   */
  getAgentByToolUseId(toolUseId: string): AgentContext | undefined {
    const agentId = this.toolUseIdToAgentId.get(toolUseId);
    if (!agentId) {
      return undefined;
    }
    return this.getAgentContext(agentId);
  }

  /**
   * Route a message to the currently active agent's widget
   * @deprecated Use routeMessageByToolUseId for accurate subagent routing
   */
  routeMessage(type: WidgetMessageType, content: string): void {
    const agent = this.getCurrentAgent();

    console.log('[StreamRouter] routeMessage called:',
      'type:', type,
      'content length:', content?.length || 0,
      'hasAgent:', !!agent,
      'agentId:', agent?.agentId || 'none',
      'hasWidgetManager:', !!this.widgetManager);

    if (!agent) {
      // No active agent - this might be the main conversation
      console.log('[StreamRouter] No active agent, message not routed');
      return;
    }

    if (!this.widgetManager) {
      console.warn('[StreamRouter] WidgetManager not set, cannot route message');
      return;
    }

    // Cancel any pending auto-close timer (agent is still active)
    this.cancelAutoClose(agent.agentId);

    // Track section changes for accumulated messages
    let isNewSection = false;
    let sectionId = agent.currentSection?.id;

    if (!agent.currentSection || agent.currentSection.type !== type) {
      // New section started
      isNewSection = true;
      sectionId = this.generateSectionId();
      agent.currentSection = { id: sectionId, type };
    }

    const message: WidgetMessage = {
      agentId: agent.agentId,
      role: agent.normalizedRole,
      type,
      content,
      timestamp: Date.now(),
      sectionId,
      isNewSection,
    };

    this.widgetManager.sendMessageToWidget(message);
  }

  /**
   * Generate a unique section ID
   */
  private generateSectionId(): string {
    return `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Route a message to a specific agent using parentToolUseId
   * This is the primary routing method for subagent messages
   *
   * @param type - Message type (thinking, speaking, tool_use, complete)
   * @param content - Message content
   * @param parentToolUseId - The tool_use_id that spawned the subagent
   * @returns true if message was routed to a subagent, false otherwise
   */
  routeMessageByToolUseId(
    type: WidgetMessageType,
    content: string,
    parentToolUseId?: string
  ): boolean {
    // If no parentToolUseId, this is a main agent message, don't route to widgets
    if (!parentToolUseId) {
      console.log('[StreamRouter] No parentToolUseId, message is from main agent');
      return false;
    }

    const agent = this.getAgentByToolUseId(parentToolUseId);

    console.log('[StreamRouter] routeMessageByToolUseId:',
      'type:', type,
      'content length:', content?.length || 0,
      'parentToolUseId:', parentToolUseId,
      'foundAgent:', agent?.agentId || 'none');

    if (!agent) {
      console.log('[StreamRouter] No agent found for parentToolUseId:', parentToolUseId);
      return false;
    }

    if (!this.widgetManager) {
      console.warn('[StreamRouter] WidgetManager not set, cannot route message');
      return false;
    }

    // Cancel any pending auto-close timer (agent is still active)
    this.cancelAutoClose(agent.agentId);

    // Track section changes for accumulated messages
    let isNewSection = false;
    let sectionId = agent.currentSection?.id;

    if (!agent.currentSection || agent.currentSection.type !== type) {
      // New section started
      isNewSection = true;
      sectionId = this.generateSectionId();
      agent.currentSection = { id: sectionId, type };
      console.log(`[StreamRouter] New section started: ${sectionId} (type: ${type})`);
    }

    const message: WidgetMessage = {
      agentId: agent.agentId,
      role: agent.normalizedRole,
      type,
      content,
      timestamp: Date.now(),
      sectionId,
      isNewSection,
    };

    this.widgetManager.sendMessageToWidget(message);
    return true;
  }

  /**
   * Route a status update to a specific agent using parentToolUseId
   */
  routeStatusByToolUseId(status: AgentStatus, parentToolUseId?: string): boolean {
    if (!parentToolUseId) {
      return false;
    }

    const agent = this.getAgentByToolUseId(parentToolUseId);
    if (!agent || !this.widgetManager) {
      return false;
    }

    this.widgetManager.sendStatusToWidget(agent.agentId, status);
    return true;
  }

  /**
   * Route a status update to the currently active agent's widget
   */
  routeStatus(status: AgentStatus): void {
    const agent = this.getCurrentAgent();

    if (!agent || !this.widgetManager) {
      return;
    }

    this.widgetManager.sendStatusToWidget(agent.agentId, status);
  }

  /**
   * Route an error to the specified agent's widget (or current if not specified)
   * Per design decision: errors only go to the specific agent, not broadcast
   */
  routeError(content: string, agentId?: string): void {
    const targetId = agentId || this.getCurrentAgent()?.agentId;

    if (!targetId || !this.widgetManager) {
      return;
    }

    const agent = this.contextStack.find((c) => c.agentId === targetId);
    if (!agent) {
      return;
    }

    this.widgetManager.sendStatusToWidget(targetId, 'error');
    this.widgetManager.sendMessageToWidget({
      agentId: targetId,
      role: agent.normalizedRole,
      type: 'speaking',
      content: `Error: ${content}`,
      timestamp: Date.now(),
    });

    // Schedule auto-close after error
    this.scheduleAutoClose(targetId);
  }

  /**
   * Broadcast a message to all active agent widgets
   * Use sparingly - prefer routeMessage for targeted delivery
   */
  broadcastMessage(type: WidgetMessageType, content: string): void {
    if (!this.widgetManager) {
      return;
    }

    for (const agent of this.contextStack) {
      this.widgetManager.sendMessageToWidget({
        agentId: agent.agentId,
        role: agent.normalizedRole,
        type,
        content,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Broadcast a status update to all active agent widgets
   */
  broadcastStatus(status: AgentStatus): void {
    if (!this.widgetManager) {
      return;
    }

    for (const agent of this.contextStack) {
      this.widgetManager.sendStatusToWidget(agent.agentId, status);
    }
  }

  /**
   * Schedule auto-close for a widget after the configured delay
   */
  private scheduleAutoClose(agentId: string): void {
    // Cancel any existing timer
    this.cancelAutoClose(agentId);

    const timer = setTimeout(() => {
      if (this.widgetManager) {
        this.widgetManager.closeWidget(agentId);
      }
      this.autoCloseTimers.delete(agentId);
    }, this.config.autoCloseDelayMs);

    this.autoCloseTimers.set(agentId, timer);
  }

  /**
   * Cancel a pending auto-close timer
   */
  private cancelAutoClose(agentId: string): void {
    const timer = this.autoCloseTimers.get(agentId);
    if (timer) {
      clearTimeout(timer);
      this.autoCloseTimers.delete(agentId);
    }
  }

  /**
   * Clear all contexts and close all widgets
   */
  clear(): void {
    // Cancel all auto-close timers
    for (const timer of this.autoCloseTimers.values()) {
      clearTimeout(timer);
    }
    this.autoCloseTimers.clear();

    // Close all widgets
    if (this.widgetManager) {
      this.widgetManager.closeAllWidgets();
    }

    this.contextStack = [];
    this.toolUseIdToAgentId.clear();
    console.log('[StreamRouter] Cleared all agent contexts and toolUseId mappings');
  }

  /**
   * Get current stack depth
   */
  getStackDepth(): number {
    return this.contextStack.length;
  }
}

/**
 * Create a new StreamRouter instance with optional configuration
 */
export function createStreamRouter(config?: Partial<StreamRouterConfig>): StreamRouter {
  return new StreamRouter(config);
}
