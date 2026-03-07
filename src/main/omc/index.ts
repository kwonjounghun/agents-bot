/**
 * OMC SDK Adapter
 *
 * Main entry point for OMC integration with Claude Agent SDK.
 * Provides installation detection, module loading, and SDK hook creation.
 */

// Re-export from importer
export {
  detectOMCInstallation,
  loadOMCModules,
  getOMCModules,
  getAvailableSkills,
  resetOMCModulesCache,
  type OMCInstallation,
  type OMCModules,
  type DetectedKeyword,
  type BuiltinSkill,
  type SkillMetadata,
  type ModeState,
  type OmcSession,
  type AgentDefinition
} from './importer';

// Re-export from hookFactory
export {
  createOMCHooks,
  mergeHooks,
  type OMCHookOptions,
  type SDKHooks,
  type HookCallback,
  type HookCallbackMatcher,
  type HookInput,
  type HookOutput,
  type HookEvent
} from './hookFactory';

/**
 * Get OMC status for UI display
 */
export interface OMCStatus {
  installed: boolean;
  version: string | null;
  skillCount: number;
  skills: string[];
  activeModes: string[];
}

import { detectOMCInstallation, getAvailableSkills } from './importer';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Get current OMC status
 */
export function getOMCStatus(workingDirectory?: string): OMCStatus {
  const installation = detectOMCInstallation();
  const skills = installation.isInstalled ? getAvailableSkills(installation) : [];

  // Check for active modes
  const activeModes: string[] = [];
  if (workingDirectory) {
    const stateDir = join(workingDirectory, '.omc/state');
    if (existsSync(stateDir)) {
      const modeFiles = ['autopilot', 'ralph', 'team', 'ultrawork', 'ultraqa', 'pipeline'];
      for (const mode of modeFiles) {
        const statePath = join(stateDir, `${mode}-state.json`);
        if (existsSync(statePath)) {
          try {
            const state = JSON.parse(readFileSync(statePath, 'utf-8'));
            if (state.active) {
              activeModes.push(mode);
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  }

  return {
    installed: installation.isInstalled,
    version: installation.version,
    skillCount: skills.length,
    skills,
    activeModes
  };
}

/**
 * Initialize OMC for SDK usage
 *
 * Call this once at app startup to load OMC modules.
 * Returns status indicating if OMC is ready to use.
 */
export async function initializeOMC(): Promise<{
  success: boolean;
  status: OMCStatus;
  error?: string;
}> {
  try {
    const { getOMCModules } = await import('./importer');
    const modules = await getOMCModules();

    const status = getOMCStatus();

    if (!modules) {
      return {
        success: false,
        status,
        error: 'OMC modules could not be loaded'
      };
    }

    console.log('[OMC] Initialized successfully');
    console.log('[OMC] Version:', status.version);
    console.log('[OMC] Skills:', status.skillCount);

    return {
      success: true,
      status
    };

  } catch (error) {
    const status = getOMCStatus();
    return {
      success: false,
      status,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
