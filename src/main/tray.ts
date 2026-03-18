/**
 * System Tray Manager
 *
 * Manages the macOS menu bar tray icon with "팀장 호출" (Call Team Leader) menu
 */

import { Tray, Menu, dialog, nativeImage, app } from 'electron';
import { join } from 'path';

// ─── Tray icon rendering helpers ────────────────────────────────────────────

interface TrayGeometry {
  centerX: number;
  centerY: number;
  radius: number;
  leftEyeX: number;
  rightEyeX: number;
  eyeY: number;
  eyeRadius: number;
}

/** Pure: compute icon geometry constants from icon size */
function computeTrayGeometry(size: number): TrayGeometry {
  const centerX = size / 2;
  const centerY = size / 2;
  return {
    centerX,
    centerY,
    radius: 8,
    leftEyeX: centerX - 3,
    rightEyeX: centerX + 3,
    eyeY: centerY - 1,
    eyeRadius: 1.5
  };
}

/** Pure: render robot-face pixels into a new RGBA buffer */
function renderTrayPixels(size: number, g: TrayGeometry): Buffer {
  const canvas = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dist = Math.sqrt((x - g.centerX) ** 2 + (y - g.centerY) ** 2);
      const leftEyeDist = Math.sqrt((x - g.leftEyeX) ** 2 + (y - g.eyeY) ** 2);
      const rightEyeDist = Math.sqrt((x - g.rightEyeX) ** 2 + (y - g.eyeY) ** 2);
      const isAntenna = x >= g.centerX - 1 && x <= g.centerX + 1 && y >= 1 && y <= 4;
      const isAntennaTop = Math.sqrt((x - g.centerX) ** 2 + (y - 1) ** 2) <= 2;

      canvas[idx] = 0; canvas[idx + 1] = 0; canvas[idx + 2] = 0;
      if (dist >= g.radius - 1.5 && dist <= g.radius) {
        canvas[idx + 3] = 255;
      } else if (leftEyeDist <= g.eyeRadius || rightEyeDist <= g.eyeRadius) {
        canvas[idx + 3] = 255;
      } else if (isAntenna || isAntennaTop) {
        canvas[idx + 3] = 200;
      } else {
        canvas[idx + 3] = 0;
      }
    }
  }
  return canvas;
}

/** Pure: build a macOS template NativeImage from an RGBA buffer */
function buildNativeImage(canvas: Buffer, size: number): Electron.NativeImage {
  const image = nativeImage.createFromBuffer(canvas, { width: size, height: size });
  image.setTemplateImage(true);
  return image;
}

// ────────────────────────────────────────────────────────────────────────────

export interface TrayCallbacks {
  onCallLeader: (workingDirectory: string) => void;
  onQuit: () => void;
  onToggleWindow?: () => void;
}

export class TrayManager {
  private tray: Tray | null = null;
  private callbacks: TrayCallbacks;

  constructor(callbacks: TrayCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Initialize the system tray
   */
  initialize(): void {
    // Create tray icon - use a simple circle for now
    const iconPath = this.getIconPath();
    const icon = this.createTrayIcon(iconPath);

    this.tray = new Tray(icon);
    this.tray.setToolTip('Claude Agent Desktop');

    // Left-click: toggle window visibility
    this.tray.on('click', () => {
      this.callbacks.onToggleWindow?.();
    });

    // Right-click: show context menu
    this.updateMenu();
  }

  /**
   * Get the path to the tray icon
   */
  private getIconPath(): string {
    // In production, icons would be in resources folder
    // For now, we'll create a template icon programmatically
    return join(__dirname, '../../resources/tray-icon.png');
  }

  /**
   * Create tray icon - fallback to programmatic icon if file doesn't exist
   */
  private createTrayIcon(_iconPath: string): Electron.NativeImage {
    const size = 22;
    const geometry = computeTrayGeometry(size);
    const canvas = renderTrayPixels(size, geometry);
    return buildNativeImage(canvas, size);
  }

  /**
   * Update the tray menu
   */
  private updateMenu(): void {
    if (!this.tray) return;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '🤖 팀장 호출 (Call Team Leader)',
        click: () => this.handleCallLeader()
      },
      { type: 'separator' },
      {
        label: 'About Claude Agent Desktop',
        click: () => {
          dialog.showMessageBox({
            type: 'info',
            title: 'Claude Agent Desktop',
            message: 'Claude Agent Desktop',
            detail: 'AI Agent orchestration with visual feedback.\n\nVersion 1.0.0'
          });
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        accelerator: 'Command+Q',
        click: () => {
          this.callbacks.onQuit();
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  /**
   * Handle "Call Team Leader" menu click
   */
  private async handleCallLeader(): Promise<void> {
    // Show directory picker
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '작업 디렉토리 선택 (Select Working Directory)',
      buttonLabel: '팀장 호출 (Call Leader)',
      message: '에이전트가 작업할 디렉토리를 선택하세요'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const workingDirectory = result.filePaths[0];
      this.callbacks.onCallLeader(workingDirectory);
    }
  }

  /**
   * Update tray icon to show active state
   */
  setActive(isActive: boolean): void {
    if (!this.tray) return;

    // Could change icon color/style to indicate active state
    this.tray.setToolTip(isActive
      ? 'Claude Agent Desktop - Team Active'
      : 'Claude Agent Desktop'
    );
  }

  /**
   * Destroy the tray
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

export function createTrayManager(callbacks: TrayCallbacks): TrayManager {
  return new TrayManager(callbacks);
}
