/**
 * Leader Agent Manager
 *
 * Manages the Team Leader agent and its sub-agents.
 * The Leader receives commands via input field and spawns sub-agents as needed.
 */

import { BrowserWindow, screen, ipcMain } from 'electron';
import { join } from 'path';
import { EventEmitter } from 'events';
import type { AgentRole, AgentStatus } from '../shared/types';

export interface SubAgentInfo {
  id: string;
  role: AgentRole;
  parentToolUseId?: string;
  status: AgentStatus;
  window: BrowserWindow | null;
}

export interface LeaderAgentManagerEvents {
  leaderCreated: { leaderId: string; workingDirectory: string };
  leaderClosed: { leaderId: string };
  subAgentCreated: { agentId: string; role: AgentRole; parentToolUseId?: string };
  subAgentClosed: { agentId: string };
  commandReceived: { leaderId: string; command: string };
}

const LEADER_WIDGET_SIZE = { width: 380, height: 500 };
const SUBAGENT_WIDGET_SIZE = { width: 200, height: 280 };
const WIDGET_SPACING = 20;

export class LeaderAgentManager extends EventEmitter {
  private leaderWindow: BrowserWindow | null = null;
  private leaderId: string | null = null;
  private workingDirectory: string | null = null;
  private subAgents: Map<string, SubAgentInfo> = new Map();
  private isLeaderReady: boolean = false;
  private messageBuffer: Array<{ agentId: string; type: string; content: string }> = [];
  /** Track sub-agent widgets that are fully loaded and ready to receive messages */
  private readySubAgents: Set<string> = new Set();
  /** Buffer for messages that arrive before sub-agent widget is ready */
  private subAgentMessageBuffer: Map<string, Array<{ channel: string; data: unknown }>> = new Map();

  constructor() {
    super();
    this.setupIPC();
  }

  /**
   * Setup IPC handlers for leader widget communication
   */
  private setupIPC(): void {
    // Handle command from leader widget input
    ipcMain.on('leader:send-command', (_event, { command }: { command: string }) => {
      if (this.leaderId && this.workingDirectory) {
        console.log('[LeaderAgentManager] Command received:', command.substring(0, 50));
        this.emit('commandReceived', {
          leaderId: this.leaderId,
          command,
          workingDirectory: this.workingDirectory
        });
      }
    });

    // Handle leader widget ready
    ipcMain.on('leader:ready', () => {
      console.log('[LeaderAgentManager] Leader widget ready');
      this.isLeaderReady = true;
      this.flushMessageBuffer();
    });

    // Handle leader widget close request
    ipcMain.on('leader:close', () => {
      this.closeLeader();
    });
  }

  /**
   * Create the Team Leader widget
   */
  async createLeader(workingDirectory: string): Promise<string> {
    // Close existing leader if any
    if (this.leaderWindow) {
      this.closeLeader();
    }

    this.leaderId = `leader-${Date.now()}`;
    this.workingDirectory = workingDirectory;
    this.isLeaderReady = false;

    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

    // Position leader widget at center-right of screen
    const x = screenWidth - LEADER_WIDGET_SIZE.width - 40;
    const y = Math.floor((screenHeight - LEADER_WIDGET_SIZE.height) / 2);

    this.leaderWindow = new BrowserWindow({
      width: LEADER_WIDGET_SIZE.width,
      height: LEADER_WIDGET_SIZE.height,
      x,
      y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      hasShadow: true,
      focusable: true,
      webPreferences: {
        preload: join(__dirname, '../preload/leaderWidgetPreload.cjs'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    // Handle window close
    this.leaderWindow.on('closed', () => {
      this.leaderWindow = null;
      this.closeAllSubAgents();
      this.emit('leaderClosed', { leaderId: this.leaderId });
      this.leaderId = null;
      this.workingDirectory = null;
    });

    // Load leader widget
    const baseUrl = process.env.NODE_ENV === 'development'
      ? 'http://localhost:5173/leader.html'
      : `file://${join(__dirname, '../renderer/leader.html')}`;

    const url = `${baseUrl}?leaderId=${this.leaderId}&workingDirectory=${encodeURIComponent(workingDirectory)}`;

    await this.leaderWindow.loadURL(url);

    console.log('[LeaderAgentManager] Leader widget created:', this.leaderId);
    this.emit('leaderCreated', { leaderId: this.leaderId, workingDirectory });

    return this.leaderId;
  }

  /**
   * Create a sub-agent widget
   */
  async createSubAgent(agentId: string, role: AgentRole, parentToolUseId?: string): Promise<SubAgentInfo> {
    if (this.subAgents.has(agentId)) {
      console.log('[LeaderAgentManager] Sub-agent already exists:', agentId);
      return this.subAgents.get(agentId)!;
    }

    const index = this.subAgents.size;
    const position = this.calculateSubAgentPosition(index);

    const window = new BrowserWindow({
      width: SUBAGENT_WIDGET_SIZE.width,
      height: SUBAGENT_WIDGET_SIZE.height,
      x: position.x,
      y: position.y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      hasShadow: false,
      focusable: false,
      webPreferences: {
        preload: join(__dirname, '../preload/widgetPreload.cjs'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    const subAgent: SubAgentInfo = {
      id: agentId,
      role,
      parentToolUseId,
      status: 'idle',
      window
    };

    this.subAgents.set(agentId, subAgent);

    // Handle window close
    window.on('closed', () => {
      this.subAgents.delete(agentId);
      this.readySubAgents.delete(agentId);
      this.subAgentMessageBuffer.delete(agentId);
      this.emit('subAgentClosed', { agentId });
    });

    // Load sub-agent widget
    const baseUrl = process.env.NODE_ENV === 'development'
      ? 'http://localhost:5173/widget.html'
      : `file://${join(__dirname, '../renderer/widget.html')}`;

    // Wait for both loadURL and did-finish-load to complete
    await new Promise<void>((resolve) => {
      window.webContents.once('did-finish-load', () => {
        this.readySubAgents.add(agentId);
        // Flush any buffered messages that arrived during loading
        this.flushSubAgentBuffer(agentId);
        resolve();
      });

      window.loadURL(`${baseUrl}?agentId=${agentId}&role=${role}`).catch((err) => {
        console.error('[LeaderAgentManager] Failed to load sub-agent widget URL:', err);
        resolve(); // Resolve anyway to avoid blocking
      });
    });

    this.emit('subAgentCreated', { agentId, role, parentToolUseId });

    return subAgent;
  }

  /**
   * Calculate position for sub-agent widget
   */
  private calculateSubAgentPosition(index: number): { x: number; y: number } {
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

    // Arrange sub-agents in a grid below the leader
    const columns = 4;
    const row = Math.floor(index / columns);
    const col = index % columns;

    const startX = screenWidth - (columns * (SUBAGENT_WIDGET_SIZE.width + WIDGET_SPACING)) - 20;
    const startY = screenHeight - SUBAGENT_WIDGET_SIZE.height - 40;

    return {
      x: startX + col * (SUBAGENT_WIDGET_SIZE.width + WIDGET_SPACING),
      y: startY - row * (SUBAGENT_WIDGET_SIZE.height + WIDGET_SPACING)
    };
  }

  /**
   * Send message to leader widget
   */
  sendToLeader(type: string, data: unknown): void {
    if (this.leaderWindow && !this.leaderWindow.isDestroyed()) {
      if (this.isLeaderReady) {
        this.leaderWindow.webContents.send(`leader:${type}`, data);
      } else {
        // Buffer messages until leader is ready
        this.messageBuffer.push({ agentId: 'leader', type, content: JSON.stringify(data) });
      }
    }
  }

  /**
   * Flush buffered messages to leader
   */
  private flushMessageBuffer(): void {
    if (!this.leaderWindow || this.leaderWindow.isDestroyed()) return;

    for (const msg of this.messageBuffer) {
      this.leaderWindow.webContents.send(`leader:${msg.type}`, JSON.parse(msg.content));
    }
    this.messageBuffer = [];
  }

  /**
   * Send message to sub-agent widget
   */
  sendToSubAgent(agentId: string, channel: string, data: unknown): void {
    const subAgent = this.subAgents.get(agentId);
    if (!subAgent?.window || subAgent.window.isDestroyed()) {
      return;
    }

    // Buffer message if widget isn't ready yet
    if (!this.readySubAgents.has(agentId)) {
      this.bufferSubAgentMessage(agentId, channel, data);
      return;
    }

    subAgent.window.webContents.send(channel, data);
  }

  /**
   * Buffer a message for later delivery when sub-agent widget is ready
   */
  private bufferSubAgentMessage(agentId: string, channel: string, data: unknown): void {
    const buffer = this.subAgentMessageBuffer.get(agentId) || [];
    buffer.push({ channel, data });
    this.subAgentMessageBuffer.set(agentId, buffer);
  }

  /**
   * Flush all buffered messages to the sub-agent widget
   */
  private flushSubAgentBuffer(agentId: string): void {
    const buffer = this.subAgentMessageBuffer.get(agentId);
    if (!buffer || buffer.length === 0) {
      return;
    }

    const subAgent = this.subAgents.get(agentId);
    if (!subAgent?.window || subAgent.window.isDestroyed()) {
      return;
    }

    for (const msg of buffer) {
      subAgent.window.webContents.send(msg.channel, msg.data);
    }
    this.subAgentMessageBuffer.delete(agentId);
  }

  /**
   * Update sub-agent status
   */
  updateSubAgentStatus(agentId: string, status: AgentStatus): void {
    const subAgent = this.subAgents.get(agentId);
    if (subAgent) {
      subAgent.status = status;
      this.sendToSubAgent(agentId, 'widget:status', { agentId, status });

      // Also notify leader about sub-agent status
      this.sendToLeader('subagent-status', { agentId, status, role: subAgent.role });
    }
  }

  /**
   * Send thinking/speaking message to sub-agent
   */
  sendSubAgentMessage(agentId: string, type: 'thinking' | 'speaking' | 'tool_use', content: string): void {
    const subAgent = this.subAgents.get(agentId);
    if (subAgent) {
      this.sendToSubAgent(agentId, 'widget:message', {
        agentId,
        role: subAgent.role,
        type,
        content,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Find sub-agent by parent tool use ID
   */
  findSubAgentByToolUseId(toolUseId: string): SubAgentInfo | undefined {
    for (const [, subAgent] of this.subAgents) {
      if (subAgent.parentToolUseId === toolUseId) {
        return subAgent;
      }
    }
    return undefined;
  }

  /**
   * Close a specific sub-agent
   */
  closeSubAgent(agentId: string): void {
    const subAgent = this.subAgents.get(agentId);
    if (subAgent?.window && !subAgent.window.isDestroyed()) {
      subAgent.window.close();
    }
    this.subAgents.delete(agentId);
    this.readySubAgents.delete(agentId);
    this.subAgentMessageBuffer.delete(agentId);
  }

  /**
   * Close all sub-agents
   */
  closeAllSubAgents(): void {
    for (const [agentId, subAgent] of this.subAgents) {
      if (subAgent.window && !subAgent.window.isDestroyed()) {
        subAgent.window.close();
      }
      this.emit('subAgentClosed', { agentId });
    }
    this.subAgents.clear();
    this.readySubAgents.clear();
    this.subAgentMessageBuffer.clear();
  }

  /**
   * Close the leader and all sub-agents
   */
  closeLeader(): void {
    this.closeAllSubAgents();

    if (this.leaderWindow && !this.leaderWindow.isDestroyed()) {
      this.leaderWindow.close();
    }
    this.leaderWindow = null;
    this.leaderId = null;
    this.workingDirectory = null;
    this.isLeaderReady = false;
  }

  /**
   * Check if leader exists
   */
  hasLeader(): boolean {
    return this.leaderWindow !== null && !this.leaderWindow.isDestroyed();
  }

  /**
   * Get current leader ID
   */
  getLeaderId(): string | null {
    return this.leaderId;
  }

  /**
   * Get current working directory
   */
  getWorkingDirectory(): string | null {
    return this.workingDirectory;
  }

  /**
   * Get all sub-agents
   */
  getSubAgents(): SubAgentInfo[] {
    return Array.from(this.subAgents.values());
  }

  /**
   * Get sub-agent count
   */
  getSubAgentCount(): number {
    return this.subAgents.size;
  }
}

export function createLeaderAgentManager(): LeaderAgentManager {
  return new LeaderAgentManager();
}
