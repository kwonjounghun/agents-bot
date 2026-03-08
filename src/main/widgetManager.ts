import { BrowserWindow, screen } from 'electron';
import { join } from 'path';
import type { AgentRole, WidgetMessage, AgentStatus } from '../shared/types';

const WIDGET_SIZE = { width: 200, height: 280 };
const WIDGET_SPACING = 20;

export class WidgetManager {
  private widgets: Map<string, BrowserWindow> = new Map();
  private basePosition: { x: number; y: number };
  /** Buffer for messages that arrive before widget is ready */
  private messageBuffer: Map<string, WidgetMessage[]> = new Map();
  /** Track widgets that are fully loaded and ready to receive messages */
  private readyWidgets: Set<string> = new Set();

  constructor() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    // Position widgets at bottom-right
    this.basePosition = {
      x: width - WIDGET_SIZE.width - 40,
      y: height - WIDGET_SIZE.height - 40
    };
  }

  async createWidget(agentId: string, role: AgentRole, index: number): Promise<BrowserWindow> {
    const position = this.calculatePosition(index);

    const widget = new BrowserWindow({
      width: WIDGET_SIZE.width,
      height: WIDGET_SIZE.height,
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

    this.widgets.set(agentId, widget);

    // Handle widget close
    widget.on('closed', () => {
      this.widgets.delete(agentId);
      this.readyWidgets.delete(agentId);
      this.messageBuffer.delete(agentId);
    });

    // Load widget renderer with query params
    const baseUrl = process.env.NODE_ENV === 'development'
      ? 'http://localhost:5173/widget.html'
      : `file://${join(__dirname, '../renderer/widget.html')}`;

    // Wait for both loadURL and did-finish-load to complete
    await new Promise<void>((resolve) => {
      widget.webContents.once('did-finish-load', () => {
        console.log('[WidgetManager] Widget ready:', agentId, 'role:', role);
        this.readyWidgets.add(agentId);
        // Flush any buffered messages that arrived during loading
        this.flushBuffer(agentId);

        // Open DevTools in development mode for debugging
        if (process.env.NODE_ENV === 'development') {
          widget.webContents.openDevTools({ mode: 'detach' });
        }

        resolve();
      });

      widget.loadURL(`${baseUrl}?agentId=${agentId}&role=${role}`).catch((err) => {
        console.error('[WidgetManager] Failed to load widget URL:', err);
        resolve(); // Resolve anyway to avoid blocking
      });
    });

    console.log('[WidgetManager] Widget creation complete:', agentId);
    return widget;
  }

  private calculatePosition(index: number): { x: number; y: number } {
    // Arrange widgets horizontally from right to left
    const x = this.basePosition.x - (index * (WIDGET_SIZE.width + WIDGET_SPACING));
    return { x, y: this.basePosition.y };
  }

  sendToWidget(agentId: string, channel: string, data: unknown): void {
    const widget = this.widgets.get(agentId);
    if (widget && !widget.isDestroyed()) {
      console.log('[WidgetManager] sendToWidget:', 'agentId:', agentId, 'channel:', channel);
      widget.webContents.send(channel, data);
    } else {
      console.log('[WidgetManager] sendToWidget failed: widget not found or destroyed for', agentId);
    }
  }

  sendMessageToWidget(message: WidgetMessage): void {
    console.log('[WidgetManager] sendMessageToWidget called:',
      'agentId:', message.agentId,
      'type:', message.type,
      'content length:', message.content?.length || 0,
      'isReady:', this.readyWidgets.has(message.agentId),
      'hasWidget:', this.widgets.has(message.agentId));

    // Buffer message if widget isn't ready yet
    if (!this.readyWidgets.has(message.agentId)) {
      console.log('[WidgetManager] Widget not ready, buffering message');
      this.bufferMessage(message);
      return;
    }
    this.sendToWidget(message.agentId, 'widget:message', message);
  }

  /**
   * Buffer a message for later delivery when widget is ready
   */
  private bufferMessage(message: WidgetMessage): void {
    const buffer = this.messageBuffer.get(message.agentId) || [];
    buffer.push(message);
    this.messageBuffer.set(message.agentId, buffer);
  }

  /**
   * Flush all buffered messages to the widget
   */
  private flushBuffer(agentId: string): void {
    const buffer = this.messageBuffer.get(agentId);
    if (!buffer || buffer.length === 0) {
      console.log('[WidgetManager] flushBuffer: no messages to flush for', agentId);
      return;
    }

    console.log('[WidgetManager] flushBuffer: flushing', buffer.length, 'messages for', agentId);
    for (const message of buffer) {
      this.sendToWidget(agentId, 'widget:message', message);
    }
    this.messageBuffer.delete(agentId);
  }

  sendStatusToWidget(agentId: string, status: AgentStatus): void {
    this.sendToWidget(agentId, 'widget:status', { agentId, status });
  }

  closeWidget(agentId: string): void {
    const widget = this.widgets.get(agentId);
    if (widget && !widget.isDestroyed()) {
      widget.close();
    }
    this.widgets.delete(agentId);
    this.readyWidgets.delete(agentId);
    this.messageBuffer.delete(agentId);
  }

  closeAllWidgets(): void {
    this.widgets.forEach((widget) => {
      if (!widget.isDestroyed()) {
        widget.close();
      }
    });
    this.widgets.clear();
    this.readyWidgets.clear();
    this.messageBuffer.clear();
  }

  getWidgetCount(): number {
    return this.widgets.size;
  }

  hasWidget(agentId: string): boolean {
    return this.widgets.has(agentId);
  }

  getAllAgentIds(): string[] {
    return Array.from(this.widgets.keys());
  }
}
