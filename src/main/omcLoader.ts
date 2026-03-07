/**
 * OMC SDK Loader
 *
 * Loads oh-my-claudecode hooks and skills for use with Claude Agent SDK.
 * This allows the Electron app to use OMC features without CLI subprocess.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// OMC plugin paths
const OMC_PLUGIN_BASE = join(homedir(), '.claude/plugins/cache/omc/oh-my-claudecode');
const OMC_SETTINGS_PATH = join(homedir(), '.claude/settings.json');

interface OMCConfig {
  pluginPath: string | null;
  version: string | null;
  skills: string[];
  isInstalled: boolean;
}

interface SDKHook {
  hooks: Array<(input: any) => Promise<{ continue: boolean; message?: string }>>;
}

interface SDKHooks {
  UserPromptSubmit?: SDKHook[];
  SubagentStart?: SDKHook[];
  SubagentStop?: SDKHook[];
  PreToolUse?: SDKHook[];
  PostToolUse?: SDKHook[];
  Stop?: SDKHook[];
}

/**
 * Detect installed OMC version and paths
 */
export function detectOMCInstallation(): OMCConfig {
  // Check if OMC is enabled in settings
  if (!existsSync(OMC_SETTINGS_PATH)) {
    return { pluginPath: null, version: null, skills: [], isInstalled: false };
  }

  try {
    const settings = JSON.parse(readFileSync(OMC_SETTINGS_PATH, 'utf-8'));
    const omcEnabled = settings?.enabledPlugins?.['oh-my-claudecode@omc'] === true;

    if (!omcEnabled) {
      return { pluginPath: null, version: null, skills: [], isInstalled: false };
    }
  } catch {
    return { pluginPath: null, version: null, skills: [], isInstalled: false };
  }

  // Find latest OMC version
  if (!existsSync(OMC_PLUGIN_BASE)) {
    return { pluginPath: null, version: null, skills: [], isInstalled: false };
  }

  const versions = readdirSync(OMC_PLUGIN_BASE)
    .filter(f => /^\d+\.\d+\.\d+$/.test(f))
    .sort((a, b) => {
      const [aMajor, aMinor, aPatch] = a.split('.').map(Number);
      const [bMajor, bMinor, bPatch] = b.split('.').map(Number);
      return bMajor - aMajor || bMinor - aMinor || bPatch - aPatch;
    });

  if (versions.length === 0) {
    return { pluginPath: null, version: null, skills: [], isInstalled: false };
  }

  const latestVersion = versions[0];
  const pluginPath = join(OMC_PLUGIN_BASE, latestVersion);

  // Get available skills
  const skillsPath = join(pluginPath, 'skills');
  let skills: string[] = [];
  if (existsSync(skillsPath)) {
    skills = readdirSync(skillsPath)
      .filter(f => !f.startsWith('.') && f !== 'AGENTS.md');
  }

  return {
    pluginPath,
    version: latestVersion,
    skills,
    isInstalled: true
  };
}

/**
 * Check if a prompt is an OMC skill command
 */
export function parseOMCCommand(prompt: string): { isCommand: boolean; skill: string | null; args: string } {
  const trimmed = prompt.trim();

  // Check for /skill-name pattern
  const match = trimmed.match(/^\/([a-z0-9-]+)(?:\s+(.*))?$/i);
  if (!match) {
    return { isCommand: false, skill: null, args: '' };
  }

  const skill = match[1].toLowerCase();
  const args = match[2] || '';

  return { isCommand: true, skill, args };
}

/**
 * Load OMC skill definition
 */
export async function loadOMCSkill(config: OMCConfig, skillName: string): Promise<string | null> {
  if (!config.pluginPath) return null;

  const skillPath = join(config.pluginPath, 'skills', skillName);
  if (!existsSync(skillPath)) return null;

  // Read skill README or index
  const readmePath = join(skillPath, 'README.md');
  const indexPath = join(skillPath, 'index.md');

  for (const path of [readmePath, indexPath]) {
    if (existsSync(path)) {
      return readFileSync(path, 'utf-8');
    }
  }

  return null;
}

/**
 * Create SDK-compatible hooks from OMC
 *
 * This creates hook handlers that process OMC features like:
 * - Skill command detection
 * - Keyword detection (autopilot, ralph, team, etc.)
 * - Persistent mode handling
 */
export async function createOMCHooks(config: OMCConfig): Promise<SDKHooks> {
  if (!config.isInstalled || !config.pluginPath) {
    console.log('[OMCLoader] OMC not installed, returning empty hooks');
    return {};
  }

  const hooks: SDKHooks = {};

  // UserPromptSubmit hook - handle skill commands and keywords
  hooks.UserPromptSubmit = [{
    hooks: [async (input: { prompt?: string; cwd?: string }) => {
      const prompt = input.prompt || '';

      // Check for skill command
      const { isCommand, skill, args } = parseOMCCommand(prompt);
      if (isCommand && skill && config.skills.includes(skill)) {
        console.log(`[OMCLoader] Detected OMC skill: ${skill}`);

        // Load skill definition
        const skillDef = await loadOMCSkill(config, skill);
        if (skillDef) {
          // Return skill instructions as additional context
          return {
            continue: true,
            message: `[OMC Skill: ${skill}]\n\n${skillDef}\n\nUser request: ${args}`
          };
        }
      }

      // Check for magic keywords (team, autopilot, ralph, etc.)
      const keywords = detectOMCKeywords(prompt);
      if (keywords.length > 0) {
        console.log(`[OMCLoader] Detected keywords: ${keywords.join(', ')}`);
      }

      return { continue: true };
    }]
  }];

  return hooks;
}

/**
 * Simple keyword detection for OMC modes
 */
function detectOMCKeywords(prompt: string): string[] {
  const detected: string[] = [];
  const lowerPrompt = prompt.toLowerCase();

  const keywords: Record<string, string[]> = {
    'team': ['team', '/team'],
    'autopilot': ['autopilot', '/autopilot', 'build me', 'i want a'],
    'ralph': ['ralph', '/ralph', "don't stop", 'must complete'],
    'ultrawork': ['ulw', 'ultrawork', '/ultrawork'],
    'plan': ['/plan', 'plan this', 'plan the'],
  };

  for (const [mode, triggers] of Object.entries(keywords)) {
    if (triggers.some(t => lowerPrompt.includes(t))) {
      detected.push(mode);
    }
  }

  return detected;
}

/**
 * Get OMC status for display in UI
 */
export function getOMCStatus(): {
  installed: boolean;
  version: string | null;
  skillCount: number;
  skills: string[];
} {
  const config = detectOMCInstallation();
  return {
    installed: config.isInstalled,
    version: config.version,
    skillCount: config.skills.length,
    skills: config.skills
  };
}

// Export for use in ClaudeAgentService
export type { OMCConfig, SDKHooks };
