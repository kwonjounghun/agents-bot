/**
 * OMC Integration Service
 *
 * Manages both SDK-OMC (built-in) and external OMC integration.
 * Single responsibility: OMC initialization, status, and prompt processing.
 */

import { EventEmitter } from 'events';

// External OMC integration
import {
  detectOMCInstallation,
  getOMCStatus as getExternalOMCStatus,
  initializeOMC,
  createOMCHooks,
  getAvailableSkills,
  type OMCStatus
} from '../omc';

// SDK-OMC (built-in OMC implementation)
import * as SdkOmc from '../../sdk-omc';
import type { OmcSdkOptions } from '../../sdk-omc/types';

// Prompt processing
import {
  parseSlashCommand,
  loadSkillDefinition,
  type ProcessedPrompt
} from './promptProcessor';

export interface OMCIntegrationConfig {
  workingDirectory: string;
}

export interface OMCIntegrationEvents {
  skillActivated: { skill: string; args: unknown };
  modeChanged: { mode: string; active: boolean };
  keywordsDetected: { keywords: unknown[] };
}

/**
 * OMC Integration Service
 *
 * Manages initialization and interaction with both SDK-OMC and external OMC.
 */
export class OMCIntegration extends EventEmitter {
  private workingDirectory: string;
  private sdkOmcEnabled: boolean = false;
  private initialized: boolean = false;
  private hooks: unknown = null;

  constructor(config: OMCIntegrationConfig) {
    super();
    this.workingDirectory = config.workingDirectory;
  }

  /**
   * Enable SDK-OMC mode (use built-in OMC implementation)
   */
  enable(): void {
    this.sdkOmcEnabled = true;
    console.log('[OMCIntegration] SDK-OMC mode enabled');
  }

  /**
   * Check if SDK-OMC mode is enabled
   */
  isEnabled(): boolean {
    return this.sdkOmcEnabled;
  }

  /**
   * Check if OMC is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get current hooks
   */
  getHooks(): unknown {
    return this.hooks;
  }

  /**
   * Set working directory
   */
  setWorkingDirectory(workingDirectory: string): void {
    this.workingDirectory = workingDirectory;
  }

  /**
   * Initialize SDK-OMC (built-in implementation)
   */
  async initializeSdk(workingDirectory?: string): Promise<{
    success: boolean;
    activeModes: string[];
    agents: string[];
    skills: string[];
  }> {
    const cwd = workingDirectory || this.workingDirectory;
    console.log('[OMCIntegration] Initializing SDK-OMC...');

    const result = await SdkOmc.initializeOmc(cwd, { debug: true });

    if (result.success) {
      this.hooks = SdkOmc.createOmcHooks();
      this.initialized = true;
      this.sdkOmcEnabled = true;

      console.log('[OMCIntegration] SDK-OMC initialized');
      console.log(`  Agents: ${result.agents.length}`);
      console.log(`  Skills: ${result.skills.length}`);
      console.log(`  Active modes: ${result.activeModes.join(', ') || 'none'}`);
    }

    return result;
  }

  /**
   * Initialize external OMC modules and hooks
   */
  async initializeExternal(workingDirectory?: string): Promise<OMCStatus> {
    if (this.initialized && this.hooks) {
      return getExternalOMCStatus(workingDirectory || this.workingDirectory);
    }

    const cwd = workingDirectory || this.workingDirectory;
    console.log('[OMCIntegration] Initializing external OMC...');

    const result = await initializeOMC();

    if (result.success) {
      this.hooks = await createOMCHooks({
        workingDirectory: cwd,
        onSkillActivated: (skill, args) => {
          console.log(`[OMCIntegration] Skill activated: ${skill}`);
          this.emit('skillActivated', { skill, args });
        },
        onModeChanged: (mode, active) => {
          console.log(`[OMCIntegration] Mode changed: ${mode} (${active ? 'active' : 'inactive'})`);
          this.emit('modeChanged', { mode, active });
        },
        onKeywordsDetected: (keywords) => {
          console.log(`[OMCIntegration] Keywords detected: ${keywords.map((k: any) => k.type).join(', ')}`);
          this.emit('keywordsDetected', { keywords });
        }
      });

      this.initialized = true;
      console.log('[OMCIntegration] External OMC initialized:', result.status.version);
    } else {
      console.log('[OMCIntegration] External OMC initialization failed:', result.error);
    }

    return result.status;
  }

  /**
   * Get SDK-OMC query options for direct SDK usage
   */
  getQueryOptions(options: OmcSdkOptions = {}): ReturnType<typeof SdkOmc.createOmcQueryOptions> {
    return SdkOmc.createOmcQueryOptions({
      workingDirectory: this.workingDirectory,
      ...options
    });
  }

  /**
   * Process prompt using SDK-OMC keyword detection
   */
  processPrompt(prompt: string): ReturnType<typeof SdkOmc.processOmcPrompt> {
    return SdkOmc.processOmcPrompt(prompt);
  }

  /**
   * Get SDK-OMC status
   */
  async getStatus(): Promise<Awaited<ReturnType<typeof SdkOmc.getOmcStatus>>> {
    return SdkOmc.getOmcStatus(this.workingDirectory);
  }

  /**
   * Get external OMC status
   */
  getExternalStatus(workingDirectory?: string): OMCStatus {
    return getExternalOMCStatus(workingDirectory || this.workingDirectory);
  }

  /**
   * Get SDK-OMC agents for subagent configuration
   */
  getAgents(): typeof SdkOmc.omcAgents {
    return SdkOmc.omcAgents;
  }

  /**
   * Process OMC commands (slash commands) and return transformed prompt with skill context
   */
  processCommand(prompt: string): ProcessedPrompt {
    const installation = detectOMCInstallation();

    if (!installation.isInstalled) {
      return { prompt };
    }

    const command = parseSlashCommand(prompt);

    if (!command) {
      return { prompt };
    }

    const availableSkills = getAvailableSkills(installation);

    if (!availableSkills.includes(command.skill)) {
      console.log(`[OMCIntegration] Unknown skill: ${command.skill}`);
      return { prompt };
    }

    console.log(`[OMCIntegration] Processing skill: ${command.skill}`);

    const skillDef = loadSkillDefinition(command.skill, installation.skillsPath || '');
    if (skillDef) {
      const skillContext = `[OMC Skill Activated: ${command.skill}]\n\n${skillDef}`;
      return {
        prompt: command.args || `Execute the ${command.skill} skill`,
        skillContext
      };
    }

    return { prompt: command.args || prompt };
  }
}

/**
 * Create an OMC integration service instance
 */
export function createOMCIntegration(config: OMCIntegrationConfig): OMCIntegration {
  return new OMCIntegration(config);
}
