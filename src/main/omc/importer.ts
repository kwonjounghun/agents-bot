/**
 * OMC Module Importer
 *
 * Dynamically imports compiled OMC modules from the local installation.
 * This allows the SDK to use OMC's keyword detection, skill loading,
 * state management, and other features without reimplementation.
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { pathToFileURL } from 'url';

// OMC plugin base path
const OMC_PLUGIN_BASE = join(homedir(), '.claude/plugins/cache/omc/oh-my-claudecode');

/**
 * OMC installation info
 */
export interface OMCInstallation {
  isInstalled: boolean;
  version: string | null;
  distPath: string | null;
  skillsPath: string | null;
  agentsPath: string | null;
}

/**
 * Loaded OMC modules
 */
export interface OMCModules {
  // Keyword Detection
  detectKeywordsWithType: (prompt: string) => DetectedKeyword[];
  extractPromptText: (prompt: string) => string;
  removeCodeBlocks: (text: string) => string;
  sanitizeForKeywordDetection: (text: string) => string;

  // Skill Loading
  loadBuiltinSkills?: (skillsPath: string) => Promise<BuiltinSkill[]>;
  parseSkillFile?: (content: string) => { metadata: SkillMetadata; body: string };

  // State Management
  readState?: (mode: string, cwd: string) => Promise<ModeState | null>;
  writeState?: (mode: string, state: object, cwd: string) => Promise<void>;
  clearState?: (mode: string, cwd: string) => Promise<void>;
  listActiveModes?: (cwd: string) => Promise<string[]>;

  // Session
  createOmcSession?: (options: object) => OmcSession;

  // Agent Definitions
  agentDefinitions?: Record<string, AgentDefinition>;

  // Raw modules (for advanced usage)
  _raw: {
    keywordDetector?: object;
    skillsModule?: object;
    stateModule?: object;
    sessionModule?: object;
    agentsModule?: object;
  };
}

// Type definitions
export interface DetectedKeyword {
  type: string;
  keyword: string;
  position: number;
}

export interface BuiltinSkill {
  name: string;
  aliases?: string[];
  description: string;
  template: string;
  model?: string;
  agent?: string;
  argumentHint?: string;
}

export interface SkillMetadata {
  name: string;
  description: string;
  aliases?: string[];
  model?: string;
  agent?: string;
  argumentHint?: string;
}

export interface ModeState {
  active: boolean;
  [key: string]: unknown;
}

export interface OmcSession {
  queryOptions: object;
  state: object;
  config: object;
  processPrompt: (prompt: string) => string;
  detectKeywords: (prompt: string) => string[];
}

export interface AgentDefinition {
  name: string;
  description: string;
  prompt: string;
  model?: string;
}

/**
 * Detect OMC installation and find the latest version
 */
export function detectOMCInstallation(): OMCInstallation {
  if (!existsSync(OMC_PLUGIN_BASE)) {
    return {
      isInstalled: false,
      version: null,
      distPath: null,
      skillsPath: null,
      agentsPath: null
    };
  }

  // Find all version directories
  const versions = readdirSync(OMC_PLUGIN_BASE)
    .filter(f => /^\d+\.\d+\.\d+$/.test(f))
    .sort((a, b) => {
      const [aMajor, aMinor, aPatch] = a.split('.').map(Number);
      const [bMajor, bMinor, bPatch] = b.split('.').map(Number);
      return bMajor - aMajor || bMinor - aMinor || bPatch - aPatch;
    });

  if (versions.length === 0) {
    return {
      isInstalled: false,
      version: null,
      distPath: null,
      skillsPath: null,
      agentsPath: null
    };
  }

  const latestVersion = versions[0];
  const versionPath = join(OMC_PLUGIN_BASE, latestVersion);

  return {
    isInstalled: true,
    version: latestVersion,
    distPath: join(versionPath, 'dist'),
    skillsPath: join(versionPath, 'skills'),
    agentsPath: join(versionPath, 'agents')
  };
}

/**
 * Load a single OMC module and extract named exports into a target object.
 * Returns the raw module or null if the file doesn't exist.
 */
async function loadSingleModule(
  filePath: string,
  logName: string
): Promise<Record<string, unknown> | null> {
  if (!existsSync(filePath)) return null;
  const mod = await import(pathToFileURL(filePath).href);
  console.log(`[OMCImporter] Loaded ${logName} module`);
  return mod as Record<string, unknown>;
}

/**
 * Load OMC modules dynamically
 *
 * Uses dynamic import to load ES modules from OMC's dist folder.
 * Falls back gracefully if modules are not available.
 */
export async function loadOMCModules(): Promise<OMCModules | null> {
  const installation = detectOMCInstallation();

  if (!installation.isInstalled || !installation.distPath) {
    console.log('[OMCImporter] OMC not installed');
    return null;
  }

  console.log('[OMCImporter] Loading OMC modules from:', installation.distPath);
  console.log('[OMCImporter] OMC version:', installation.version);

  const modules: OMCModules = {
    detectKeywordsWithType: () => [],
    extractPromptText: (p) => p,
    removeCodeBlocks: (t) => t,
    sanitizeForKeywordDetection: (t) => t,
    _raw: {}
  };

  try {
    // Load keyword detector
    const keywordModule = await loadSingleModule(
      join(installation.distPath, 'hooks/keyword-detector/index.js'),
      'keyword detector'
    );
    if (keywordModule) {
      modules._raw.keywordDetector = keywordModule;
      if (keywordModule.detectKeywordsWithType) modules.detectKeywordsWithType = keywordModule.detectKeywordsWithType as typeof modules.detectKeywordsWithType;
      if (keywordModule.extractPromptText) modules.extractPromptText = keywordModule.extractPromptText as typeof modules.extractPromptText;
      if (keywordModule.removeCodeBlocks) modules.removeCodeBlocks = keywordModule.removeCodeBlocks as typeof modules.removeCodeBlocks;
      if (keywordModule.sanitizeForKeywordDetection) modules.sanitizeForKeywordDetection = keywordModule.sanitizeForKeywordDetection as typeof modules.sanitizeForKeywordDetection;
    }

    // Load builtin skills module
    const skillsModule = await loadSingleModule(
      join(installation.distPath, 'features/builtin-skills/skills.js'),
      'skills'
    );
    if (skillsModule) {
      modules._raw.skillsModule = skillsModule;
      if (skillsModule.loadBuiltinSkills) modules.loadBuiltinSkills = skillsModule.loadBuiltinSkills as typeof modules.loadBuiltinSkills;
      if (skillsModule.parseSkillFile) modules.parseSkillFile = skillsModule.parseSkillFile as typeof modules.parseSkillFile;
    }

    // Load state manager (try multiple possible paths)
    const stateManagerPaths = [
      join(installation.distPath, 'features/state-manager/index.js'),
      join(installation.distPath, 'hooks/state/index.js'),
      join(installation.distPath, 'lib/state.js')
    ];

    for (const statePath of stateManagerPaths) {
      const stateModule = await loadSingleModule(statePath, `state manager from: ${statePath}`);
      if (stateModule) {
        modules._raw.stateModule = stateModule;
        if (stateModule.readState) modules.readState = stateModule.readState as typeof modules.readState;
        if (stateModule.writeState) modules.writeState = stateModule.writeState as typeof modules.writeState;
        if (stateModule.clearState) modules.clearState = stateModule.clearState as typeof modules.clearState;
        if (stateModule.listActiveModes) modules.listActiveModes = stateModule.listActiveModes as typeof modules.listActiveModes;
        break;
      }
    }

    // Load main OMC session creator
    const sessionModule = await loadSingleModule(
      join(installation.distPath, 'index.js'),
      'main'
    );
    if (sessionModule) {
      modules._raw.sessionModule = sessionModule;
      if (sessionModule.createOmcSession) modules.createOmcSession = sessionModule.createOmcSession as typeof modules.createOmcSession;
    }

    // Load agent definitions
    const agentsModule = await loadSingleModule(
      join(installation.distPath, 'agents/definitions.js'),
      'agent definitions'
    );
    if (agentsModule) {
      modules._raw.agentsModule = agentsModule;
      // Agent definitions might be default export or named export
      modules.agentDefinitions = (agentsModule.default || agentsModule.agents || agentsModule) as typeof modules.agentDefinitions;
    }

    console.log('[OMCImporter] Successfully loaded OMC modules');
    return modules;

  } catch (error) {
    console.error('[OMCImporter] Error loading OMC modules:', error);
    return null;
  }
}

/**
 * Get list of available skills from OMC installation
 */
export function getAvailableSkills(installation: OMCInstallation): string[] {
  if (!installation.skillsPath || !existsSync(installation.skillsPath)) {
    return [];
  }

  return readdirSync(installation.skillsPath)
    .filter(f => !f.startsWith('.') && f !== 'AGENTS.md')
    .filter(f => {
      const skillPath = join(installation.skillsPath!, f);
      return existsSync(join(skillPath, 'SKILL.md')) ||
             existsSync(join(skillPath, 'index.md')) ||
             existsSync(join(skillPath, 'README.md'));
    });
}

// Singleton instance for cached modules
let cachedModules: OMCModules | null = null;
let modulesLoaded = false;

/**
 * Get cached OMC modules (loads once, returns cached)
 */
export async function getOMCModules(): Promise<OMCModules | null> {
  if (modulesLoaded) {
    return cachedModules;
  }

  cachedModules = await loadOMCModules();
  modulesLoaded = true;
  return cachedModules;
}

/**
 * Reset cached modules (useful for testing or after OMC update)
 */
export function resetOMCModulesCache(): void {
  cachedModules = null;
  modulesLoaded = false;
}
