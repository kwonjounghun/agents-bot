/**
 * OMC Hook Factory
 *
 * Creates SDK-compatible hooks using OMC's imported modules.
 * These hooks enable keyword detection, skill loading, state management,
 * and other OMC features within the Claude Agent SDK.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  getOMCModules,
  detectOMCInstallation,
  getAvailableSkills,
  type OMCModules,
  type DetectedKeyword
} from './importer';

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

/**
 * Parse slash command from prompt
 */
function parseSlashCommand(prompt: string): { skill: string; args: string } | null {
  const trimmed = prompt.trim();
  const match = trimmed.match(/^\/([a-z0-9-]+)(?:\s+(.*))?$/i);

  if (!match) {
    return null;
  }

  return {
    skill: match[1].toLowerCase(),
    args: match[2] || ''
  };
}

/**
 * Load skill definition from SKILL.md file
 */
function loadSkillDefinition(skillName: string): string | null {
  const installation = detectOMCInstallation();
  if (!installation.skillsPath) return null;

  const skillDir = join(installation.skillsPath, skillName);
  const possibleFiles = ['SKILL.md', 'index.md', 'README.md'];

  for (const file of possibleFiles) {
    const filePath = join(skillDir, file);
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
 * Create UserPromptSubmit hook handler
 */
function createUserPromptSubmitHook(
  modules: OMCModules,
  options: OMCHookOptions
): HookCallback {
  const availableSkills = getAvailableSkills(detectOMCInstallation());

  return async (input: HookInput): Promise<HookOutput> => {
    const prompt = input.prompt || '';
    let additionalContext = '';

    // 1. Check for slash command
    const command = parseSlashCommand(prompt);
    if (command && availableSkills.includes(command.skill)) {
      console.log(`[OMCHook] Detected skill command: /${command.skill}`);

      const skillDef = loadSkillDefinition(command.skill);
      if (skillDef) {
        additionalContext = `[OMC Skill Activated: ${command.skill}]\n\n${skillDef}`;

        if (options.onSkillActivated) {
          options.onSkillActivated(command.skill, command.args);
        }
      }
    }

    // 2. Detect magic keywords
    if (modules.detectKeywordsWithType) {
      try {
        const keywords = modules.detectKeywordsWithType(prompt);

        if (keywords && keywords.length > 0) {
          console.log('[OMCHook] Detected keywords:', keywords.map(k => k.type).join(', '));

          if (options.onKeywordsDetected) {
            options.onKeywordsDetected(keywords);
          }

          // For each keyword, try to load corresponding skill
          for (const kw of keywords) {
            // Skip if we already loaded a skill via slash command
            if (command) continue;

            // Map keyword to skill name
            const skillName = mapKeywordToSkill(kw.type);
            if (skillName && availableSkills.includes(skillName)) {
              const skillDef = loadSkillDefinition(skillName);
              if (skillDef && !additionalContext) {
                additionalContext = `[OMC Mode: ${kw.type}]\n\n${skillDef}`;

                if (options.onModeChanged) {
                  options.onModeChanged(kw.type, true);
                }
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
 * Map keyword type to skill name
 */
function mapKeywordToSkill(keywordType: string): string | null {
  const mapping: Record<string, string> = {
    'autopilot': 'autopilot',
    'ralph': 'ralph',
    'team': 'team',
    'ultrawork': 'ultrawork',
    'ultraqa': 'ultraqa',
    'plan': 'plan',
    'analyze': 'analyze',
    'tdd': 'tdd',
    'cancel': 'cancel',
    'pipeline': 'pipeline',
    'ralplan': 'ralplan',
    'ccg': 'ccg',
    'swarm': 'team', // swarm is alias for team
    'ultrapilot': 'ultrapilot'
  };

  return mapping[keywordType] || null;
}

/**
 * Create SessionStart hook handler
 */
function createSessionStartHook(
  modules: OMCModules,
  options: OMCHookOptions
): HookCallback {
  return async (input: HookInput): Promise<HookOutput> => {
    const cwd = input.cwd || options.workingDirectory;
    let additionalContext = '';

    // Load project memory if available
    const projectMemoryPath = join(cwd, '.omc/project-memory.json');
    if (existsSync(projectMemoryPath)) {
      try {
        const memory = JSON.parse(readFileSync(projectMemoryPath, 'utf-8'));
        if (memory.directives && memory.directives.length > 0) {
          additionalContext += `\n## Project Directives\n`;
          for (const directive of memory.directives) {
            additionalContext += `- ${directive.directive}\n`;
          }
        }
        if (memory.notes && Object.keys(memory.notes).length > 0) {
          additionalContext += `\n## Project Notes\n`;
          for (const [category, notesList] of Object.entries(memory.notes)) {
            if (Array.isArray(notesList) && notesList.length > 0) {
              additionalContext += `### ${category}\n`;
              for (const note of notesList) {
                additionalContext += `- ${note}\n`;
              }
            }
          }
        }
        console.log('[OMCHook] Loaded project memory');
      } catch (error) {
        console.error('[OMCHook] Error loading project memory:', error);
      }
    }

    // Check for active modes
    if (modules.listActiveModes) {
      try {
        const activeModes = await modules.listActiveModes(cwd);
        if (activeModes && activeModes.length > 0) {
          additionalContext += `\n## Active OMC Modes\n`;
          for (const mode of activeModes) {
            additionalContext += `- ${mode}\n`;
            if (options.onModeChanged) {
              options.onModeChanged(mode, true);
            }
          }
          console.log('[OMCHook] Active modes:', activeModes.join(', '));
        }
      } catch (error) {
        console.error('[OMCHook] Error checking active modes:', error);
      }
    }

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
 * Create Stop hook handler (prevents premature stop during skill execution)
 */
function createStopHook(
  modules: OMCModules,
  options: OMCHookOptions
): HookCallback {
  return async (input: HookInput): Promise<HookOutput> => {
    const cwd = input.cwd || options.workingDirectory;

    // Check for active skill state
    const skillStatePath = join(cwd, '.omc/state/skill-active-state.json');
    if (existsSync(skillStatePath)) {
      try {
        const skillState = JSON.parse(readFileSync(skillStatePath, 'utf-8'));

        if (skillState.active && skillState.reinforcement_count > 0) {
          console.log('[OMCHook] Skill protection active:', skillState.skill_name);
          return {
            continue: true,
            systemMessage: `[SKILL PROTECTION] ${skillState.skill_name} is still active. Continue working until completion.`
          };
        }
      } catch (error) {
        console.error('[OMCHook] Error reading skill state:', error);
      }
    }

    // Check for active persistent modes
    const persistentModes = ['autopilot', 'ralph', 'team', 'ultrawork'];
    for (const mode of persistentModes) {
      const modePath = join(cwd, `.omc/state/${mode}-state.json`);
      if (existsSync(modePath)) {
        try {
          const modeState = JSON.parse(readFileSync(modePath, 'utf-8'));
          if (modeState.active) {
            console.log('[OMCHook] Persistent mode active:', mode);
            return {
              continue: true,
              systemMessage: `[${mode.toUpperCase()} MODE ACTIVE] Continue working. Run /oh-my-claudecode:cancel when all tasks are complete.`
            };
          }
        } catch {
          continue;
        }
      }
    }

    return { continue: true };
  };
}

/**
 * Create SubagentStart hook handler
 */
function createSubagentStartHook(
  modules: OMCModules,
  options: OMCHookOptions
): HookCallback {
  return async (input: HookInput): Promise<HookOutput> => {
    console.log('[OMCHook] Subagent started:', input.agent_type, input.agent_id);

    // Could add tracking, widget spawning, etc.

    return { continue: true };
  };
}

/**
 * Create SubagentStop hook handler
 */
function createSubagentStopHook(
  modules: OMCModules,
  options: OMCHookOptions
): HookCallback {
  return async (input: HookInput): Promise<HookOutput> => {
    console.log('[OMCHook] Subagent stopped:', input.agent_id);

    // Could add cleanup, result collection, etc.

    return { continue: true };
  };
}

/**
 * Create all OMC hooks for SDK integration
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
 * Merge OMC hooks with existing hooks
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
