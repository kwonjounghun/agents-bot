/**
 * OMC Manager Module
 * Single Responsibility: Manage OMC lifecycle and state
 *
 * This module handles:
 * - OMC initialization (external and SDK-OMC)
 * - OMC status tracking
 * - OMC hooks management
 *
 * Usage:
 *   const manager = createOMCManager({ onSkillActivated, onModeChanged });
 *   await manager.initialize(workingDirectory);
 *   const status = manager.getStatus();
 */

import type { SDKHooks } from './hookBuilder';

export interface OMCStatus {
  installed: boolean;
  version: string | null;
  skillCount: number;
  skills: string[];
  activeModes: string[];
}

export interface OMCManagerCallbacks {
  onSkillActivated?: (skill: string, args: string) => void;
  onModeChanged?: (mode: string, active: boolean) => void;
  onKeywordsDetected?: (keywords: unknown[]) => void;
}

export interface OMCManager {
  /**
   * Initialize external OMC.
   */
  initialize(workingDirectory: string): Promise<OMCStatus>;

  /**
   * Initialize SDK-OMC (built-in implementation).
   */
  initializeSdkOmc(workingDirectory: string): Promise<SdkOmcResult>;

  /**
   * Get current OMC status.
   */
  getStatus(workingDirectory: string): OMCStatus;

  /**
   * Get the current OMC hooks.
   */
  getHooks(): SDKHooks | null;

  /**
   * Check if OMC has been initialized.
   */
  isInitialized(): boolean;

  /**
   * Check if SDK-OMC mode is enabled.
   */
  isSdkOmcEnabled(): boolean;

  /**
   * Enable SDK-OMC mode.
   */
  enableSdkOmc(): void;

  /**
   * Reset the manager (for testing).
   */
  reset(): void;
}

export interface SdkOmcResult {
  success: boolean;
  activeModes: string[];
  agents: string[];
  skills: string[];
}

export interface ExternalOMCModule {
  detectOMCInstallation: () => { isInstalled: boolean; skillsPath?: string };
  getOMCStatus: (workingDirectory: string) => OMCStatus;
  initializeOMC: () => Promise<{ success: boolean; status: OMCStatus; error?: string }>;
  createOMCHooks: (options: {
    workingDirectory: string;
    onSkillActivated?: (skill: string, args: string) => void;
    onModeChanged?: (mode: string, active: boolean) => void;
    onKeywordsDetected?: (keywords: unknown[]) => void;
  }) => Promise<SDKHooks>;
  getAvailableSkills: (installation: { isInstalled: boolean; skillsPath?: string }) => string[];
}

export interface SdkOmcModule {
  initializeOmc: (cwd: string, options?: { debug?: boolean }) => Promise<SdkOmcResult>;
  createOmcHooks: () => SDKHooks;
  processOmcPrompt: (prompt: string) => { suggestedMode?: string; suggestedAgent?: string };
  getOmcStatus: (cwd: string) => Promise<OMCStatus>;
  omcAgents: Record<string, { description: string }>;
}

/**
 * Create a new OMC manager instance.
 *
 * @param callbacks - Event callbacks for OMC events
 * @param externalOmc - External OMC module (optional, for dependency injection)
 * @param sdkOmc - SDK-OMC module (optional, for dependency injection)
 */
export function createOMCManager(
  callbacks: OMCManagerCallbacks = {},
  externalOmc?: ExternalOMCModule,
  sdkOmc?: SdkOmcModule
): OMCManager {
  let hooks: SDKHooks | null = null;
  let initialized = false;
  let useSdkOmc = false;

  return {
    async initialize(workingDirectory: string): Promise<OMCStatus> {
      if (initialized && hooks) {
        return externalOmc?.getOMCStatus(workingDirectory) || createEmptyStatus();
      }

      console.log('[OMCManager] Initializing OMC...');

      if (!externalOmc) {
        console.log('[OMCManager] External OMC module not provided');
        return createEmptyStatus();
      }

      const result = await externalOmc.initializeOMC();

      if (result.success) {
        hooks = await externalOmc.createOMCHooks({
          workingDirectory,
          onSkillActivated: callbacks.onSkillActivated,
          onModeChanged: callbacks.onModeChanged,
          onKeywordsDetected: callbacks.onKeywordsDetected
        });

        initialized = true;
        console.log('[OMCManager] OMC initialized:', result.status.version);
      } else {
        console.log('[OMCManager] OMC initialization failed:', result.error);
      }

      return result.status;
    },

    async initializeSdkOmc(workingDirectory: string): Promise<SdkOmcResult> {
      console.log('[OMCManager] Initializing SDK-OMC...');

      if (!sdkOmc) {
        console.log('[OMCManager] SDK-OMC module not provided');
        return { success: false, activeModes: [], agents: [], skills: [] };
      }

      const result = await sdkOmc.initializeOmc(workingDirectory, { debug: true });

      if (result.success) {
        hooks = sdkOmc.createOmcHooks();
        initialized = true;
        useSdkOmc = true;

        console.log('[OMCManager] SDK-OMC initialized');
        console.log(`  Agents: ${result.agents.length}`);
        console.log(`  Skills: ${result.skills.length}`);
        console.log(`  Active modes: ${result.activeModes.join(', ') || 'none'}`);
      }

      return result;
    },

    getStatus(workingDirectory: string): OMCStatus {
      if (externalOmc) {
        return externalOmc.getOMCStatus(workingDirectory);
      }
      return createEmptyStatus();
    },

    getHooks(): SDKHooks | null {
      return hooks;
    },

    isInitialized(): boolean {
      return initialized;
    },

    isSdkOmcEnabled(): boolean {
      return useSdkOmc;
    },

    enableSdkOmc(): void {
      useSdkOmc = true;
      console.log('[OMCManager] SDK-OMC mode enabled');
    },

    reset(): void {
      hooks = null;
      initialized = false;
      useSdkOmc = false;
    }
  };
}

/**
 * Create an empty OMC status object.
 */
function createEmptyStatus(): OMCStatus {
  return {
    installed: false,
    version: null,
    skillCount: 0,
    skills: [],
    activeModes: []
  };
}
