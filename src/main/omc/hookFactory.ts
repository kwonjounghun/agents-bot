/**
 * OMC Hook Factory
 *
 * Creates SDK-compatible hooks using OMC's imported modules.
 * These hooks are thin wrappers that delegate business logic
 * to pure functions in hookLogic.ts.
 *
 * Responsibilities:
 *   - I/O operations (file reading, console logging)
 *   - Callback invocations (onSkillActivated, onModeChanged, etc.)
 *   - Converting HookInput to pure function parameters
 *
 * All business logic is in hookLogic.ts for testability.
 */

import { existsSync, readFileSync } from 'fs';
import {
  getOMCModules,
  detectOMCInstallation,
  getAvailableSkills,
  type OMCModules,
  type DetectedKeyword
} from './importer';

// Import pure functions
import {
  parseSlashCommand,
  isSkillAvailable,
  mapKeywordToSkill,
  buildSkillContext,
  buildModeContext,
  processSessionStart,
  checkShouldPreventStop,
  getProjectMemoryPath,
  getSkillStatePath,
  getModeStatePath,
  getSkillDefinitionPaths,
  PERSISTENT_MODES,
  type ProjectMemory,
  type ModeState
} from './hookLogic';

/**
 * SDK Hook types (matching @anthropic-ai/claude-agent-sdk)
 */
type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Notification'
  | 'UserPromptSubmit'
  | 'SessionStart'
  | 'SessionEnd'
  | 'Stop'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact'
  | 'PermissionRequest';

interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: HookEvent;
  prompt?: string;
  tool_name?: string;
  tool_input?: string;
  tool_response?: string;
  agent_id?: string;
  agent_type?: string;
  [key: string]: unknown;
}

interface HookOutput {
  continue?: boolean;
  suppressOutput?: boolean;
  stopReason?: string;
  systemMessage?: string;
  hookSpecificOutput?: {
    hookEventName?: string;
    additionalContext?: string;
    [key: string]: unknown;
  };
}

type HookCallback = (
  input: HookInput,
  toolUseId?: string,
  options?: { signal: AbortSignal }
) => Promise<HookOutput>;

interface HookCallbackMatcher {
  matcher?: string;
  hooks: HookCallback[];
  timeout?: number;
}

type SDKHooks = Partial<Record<HookEvent, HookCallbackMatcher[]>>;

/**
 * OMC Hook Factory Options
 */
export interface OMCHookOptions {
  workingDirectory: string;
  sessionId?: string;
  onSkillActivated?: (skill: string, args: string) => void;
  onModeChanged?: (mode: string, active: boolean) => void;
  onKeywordsDetected?: (keywords: DetectedKeyword[]) => void;
}

// ============================================
// I/O Helpers (Side Effect Functions)
// ============================================

/**
 * Load skill definition from SKILL.md file.
 * Side effect: file system read
 */
function loadSkillDefinition(skillName: string): string | null {
  const installation = detectOMCInstallation();
  if (!installation.skillsPath) return null;

  const paths = getSkillDefinitionPaths(installation.skillsPath, skillName);

  for (const filePath of paths) {
    if (existsSync(filePath)) {
      try {
        return readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Read and parse JSON file safely.
 * Side effect: file system read
 */
function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;

  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

// ============================================
// Hook Handlers (Thin Wrappers)
// ============================================

/**
 * Create UserPromptSubmit hook handler.
 * Delegates to pure functions for business logic.
 */
function createUserPromptSubmitHook(
  modules: OMCModules,
  options: OMCHookOptions
): HookCallback {
  const availableSkills = getAvailableSkills(detectOMCInstallation());

  return async (input: HookInput): Promise<HookOutput> => {
    const prompt = input.prompt || '';
    let additionalContext = '';
    let activatedSkill: string | undefined;

    // 1. Check for slash command (pure function)
    const command = parseSlashCommand(prompt);
    if (command && isSkillAvailable(command.skill, availableSkills)) {
      console.log(`[OMCHook] Detected skill command: /${command.skill}`);

      const skillDef = loadSkillDefinition(command.skill);
      if (skillDef) {
        additionalContext = buildSkillContext(command.skill, skillDef);
        activatedSkill = command.skill;

        // Side effect: callback invocation
        if (options.onSkillActivated) {
          options.onSkillActivated(command.skill, command.args);
        }
      }
    }

    // 2. Detect magic keywords (via OMC modules)
    if (!activatedSkill && modules.detectKeywordsWithType) {
      try {
        const keywords = modules.detectKeywordsWithType(prompt);

        if (keywords && keywords.length > 0) {
          console.log('[OMCHook] Detected keywords:', keywords.map(k => k.type).join(', '));

          // Side effect: callback invocation
          if (options.onKeywordsDetected) {
            options.onKeywordsDetected(keywords);
          }

          // Map keywords to skills (pure function)
          for (const kw of keywords) {
            const skillName = mapKeywordToSkill(kw.type);
            if (skillName && isSkillAvailable(skillName, availableSkills)) {
              const skillDef = loadSkillDefinition(skillName);
              if (skillDef && !additionalContext) {
                additionalContext = buildModeContext(kw.type, skillDef);

                // Side effect: callback invocation
                if (options.onModeChanged) {
                  options.onModeChanged(kw.type, true);
                }
                break; // Only activate first matching mode
              }
            }
          }
        }
      } catch (error) {
        console.error('[OMCHook] Error detecting keywords:', error);
      }
    }

    // Return with additional context if we found anything
    if (additionalContext) {
      return {
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext
        }
      };
    }

    return { continue: true };
  };
}

/**
 * Create SessionStart hook handler.
 * Delegates to pure functions for context building.
 */
function createSessionStartHook(
  modules: OMCModules,
  options: OMCHookOptions
): HookCallback {
  return async (input: HookInput): Promise<HookOutput> => {
    const cwd = input.cwd || options.workingDirectory;

    // Read project memory (I/O)
    const projectMemoryPath = getProjectMemoryPath(cwd);
    const projectMemory = readJsonFile<ProjectMemory>(projectMemoryPath);

    // Get active modes (I/O via module)
    let activeModes: string[] = [];
    if (modules.listActiveModes) {
      try {
        activeModes = await modules.listActiveModes(cwd) || [];

        // Side effect: callback invocations
        for (const mode of activeModes) {
          if (options.onModeChanged) {
            options.onModeChanged(mode, true);
          }
        }

        if (activeModes.length > 0) {
          console.log('[OMCHook] Active modes:', activeModes.join(', '));
        }
      } catch (error) {
        console.error('[OMCHook] Error checking active modes:', error);
      }
    }

    if (projectMemory) {
      console.log('[OMCHook] Loaded project memory');
    }

    // Build context using pure function
    const additionalContext = processSessionStart({
      projectMemory,
      activeModes
    });

    if (additionalContext) {
      return {
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext
        }
      };
    }

    return { continue: true };
  };
}

/**
 * Create Stop hook handler.
 * Delegates to pure functions for stop prevention logic.
 */
function createStopHook(
  _modules: OMCModules,
  options: OMCHookOptions
): HookCallback {
  return async (input: HookInput): Promise<HookOutput> => {
    const cwd = input.cwd || options.workingDirectory;

    // Read skill state (I/O)
    const skillStatePath = getSkillStatePath(cwd);
    const skillState = readJsonFile<ModeState>(skillStatePath);

    // Read mode states (I/O)
    const modeStates: Array<{ mode: string; state: ModeState }> = [];
    for (const mode of PERSISTENT_MODES) {
      const modePath = getModeStatePath(cwd, mode);
      const state = readJsonFile<ModeState>(modePath);
      if (state) {
        modeStates.push({ mode, state });
      }
    }

    // Check if stop should be prevented (pure function)
    const result = checkShouldPreventStop({
      skillState,
      modeStates
    });

    if (result.shouldPreventStop) {
      console.log('[OMCHook] Stop prevented:', result.reason);
      return {
        continue: true,
        systemMessage: result.systemMessage
      };
    }

    return { continue: true };
  };
}

/**
 * Create SubagentStart hook handler.
 */
function createSubagentStartHook(
  _modules: OMCModules,
  _options: OMCHookOptions
): HookCallback {
  return async (input: HookInput): Promise<HookOutput> => {
    console.log('[OMCHook] Subagent started:', input.agent_type, input.agent_id);
    return { continue: true };
  };
}

/**
 * Create SubagentStop hook handler.
 */
function createSubagentStopHook(
  _modules: OMCModules,
  _options: OMCHookOptions
): HookCallback {
  return async (input: HookInput): Promise<HookOutput> => {
    console.log('[OMCHook] Subagent stopped:', input.agent_id);
    return { continue: true };
  };
}

// ============================================
// Public API
// ============================================

/**
 * Create all OMC hooks for SDK integration.
 */
export async function createOMCHooks(options: OMCHookOptions): Promise<SDKHooks | null> {
  const modules = await getOMCModules();

  if (!modules) {
    console.log('[OMCHookFactory] OMC modules not available');
    return null;
  }

  console.log('[OMCHookFactory] Creating OMC hooks');

  return {
    UserPromptSubmit: [{
      hooks: [createUserPromptSubmitHook(modules, options)]
    }],

    SessionStart: [{
      hooks: [createSessionStartHook(modules, options)]
    }],

    Stop: [{
      hooks: [createStopHook(modules, options)]
    }],

    SubagentStart: [{
      hooks: [createSubagentStartHook(modules, options)]
    }],

    SubagentStop: [{
      hooks: [createSubagentStopHook(modules, options)]
    }]
  };
}

/**
 * Merge OMC hooks with existing hooks.
 */
export function mergeHooks(existingHooks: SDKHooks, omcHooks: SDKHooks): SDKHooks {
  const merged: SDKHooks = { ...existingHooks };

  for (const [event, matchers] of Object.entries(omcHooks)) {
    const hookEvent = event as HookEvent;
    if (merged[hookEvent]) {
      // Prepend OMC hooks (run first)
      merged[hookEvent] = [...matchers!, ...merged[hookEvent]!];
    } else {
      merged[hookEvent] = matchers;
    }
  }

  return merged;
}

// Export types for external use
export type { SDKHooks, HookCallback, HookCallbackMatcher, HookInput, HookOutput, HookEvent };
