import { BrowserWindow, screen } from 'electron';
import { join } from 'path';
import type { AgentRole, WidgetMessage, AgentStatus } from '../shared/types';

const WIDGET_SIZE = { width: 200, height: 280 };
const WIDGET_SPACING = 20;

export class WidgetManager {
  private widgets: Map<string, BrowserWindow> = new Map();
  private basePosition: { x: number; y: number };

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

    // Load widget renderer with query params
    const baseUrl = process.env.NODE_ENV === 'development'
      ? 'http://localhost:5173/widget.html'
      : `file://${join(__dirname, '../renderer/widget.html')}`;

    await widget.loadURL(`${baseUrl}?agentId=${agentId}&role=${role}`);

    this.widgets.set(agentId, widget);

    // Handle widget close
    widget.on('closed', () => {
      this.widgets.delete(agentId);
    });

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
      widget.webContents.send(channel, data);
    }
  }

  sendMessageToWidget(message: WidgetMessage): void {
    this.sendToWidget(message.agentId, 'widget:message', message);
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
  }

  closeAllWidgets(): void {
    this.widgets.forEach((widget) => {
      if (!widget.isDestroyed()) {
        widget.close();
      }
    });
    this.widgets.clear();
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
