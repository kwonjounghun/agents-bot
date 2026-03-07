/**
 * System Tray Manager
 *
 * Manages the macOS menu bar tray icon with "팀장 호출" (Call Team Leader) menu
 */

import { Tray, Menu, dialog, nativeImage, app } from 'electron';
import { join } from 'path';

export interface TrayCallbacks {
  onCallLeader: (workingDirectory: string) => void;
  onQuit: () => void;
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
    // Create a simple 22x22 template icon for macOS menu bar
    // Template images should be black with transparency
    const size = 22;
    const canvas = Buffer.alloc(size * size * 4);

    // Draw a simple robot face icon
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Create a circular robot head
        const centerX = size / 2;
        const centerY = size / 2;
        const radius = 8;
        const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

        // Eyes positions
        const leftEyeX = centerX - 3;
        const rightEyeX = centerX + 3;
        const eyeY = centerY - 1;
        const eyeRadius = 1.5;

        const leftEyeDist = Math.sqrt((x - leftEyeX) ** 2 + (y - eyeY) ** 2);
        const rightEyeDist = Math.sqrt((x - rightEyeX) ** 2 + (y - eyeY) ** 2);

        // Antenna
        const isAntenna = x >= centerX - 1 && x <= centerX + 1 && y >= 1 && y <= 4;
        const isAntennaTop = Math.sqrt((x - centerX) ** 2 + (y - 1) ** 2) <= 2;

        if (dist <= radius || isAntenna || isAntennaTop) {
          // Head outline or antenna
          if (dist >= radius - 1.5 && dist <= radius) {
            // Outer ring
            canvas[idx] = 0;     // R
            canvas[idx + 1] = 0; // G
            canvas[idx + 2] = 0; // B
            canvas[idx + 3] = 255; // A
          } else if (leftEyeDist <= eyeRadius || rightEyeDist <= eyeRadius) {
            // Eyes
            canvas[idx] = 0;
            canvas[idx + 1] = 0;
            canvas[idx + 2] = 0;
            canvas[idx + 3] = 255;
          } else if (isAntenna || isAntennaTop) {
            // Antenna
            canvas[idx] = 0;
            canvas[idx + 1] = 0;
            canvas[idx + 2] = 0;
            canvas[idx + 3] = 200;
          } else {
            // Transparent inside
            canvas[idx] = 0;
            canvas[idx + 1] = 0;
            canvas[idx + 2] = 0;
            canvas[idx + 3] = 0;
          }
        } else {
          // Transparent outside
          canvas[idx] = 0;
          canvas[idx + 1] = 0;
          canvas[idx + 2] = 0;
          canvas[idx + 3] = 0;
        }
      }
    }

    const image = nativeImage.createFromBuffer(canvas, {
      width: size,
      height: size
    });

    // Set as template image for macOS (adapts to light/dark mode)
    image.setTemplateImage(true);

    return image;
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
      console.log('[Tray] Calling team leader for directory:', workingDirectory);
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
