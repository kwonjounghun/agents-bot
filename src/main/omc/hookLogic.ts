/**
 * Hook Logic Module (Pure Functions)
 * Single Responsibility: Data transformation and business logic for hooks
 *
 * This module contains PURE FUNCTIONS with no side effects.
 * All I/O operations (file reading, console logging) are handled
 * by the caller (hookFactory.ts).
 *
 * Usage:
 *   const command = parseSlashCommand('/autopilot build');
 *   const skillName = mapKeywordToSkill('autopilot');
 *   const context = buildSkillContext('autopilot', skillDefinition);
 */

/**
 * Parsed slash command result
 */
export interface SlashCommand {
  skill: string;
  args: string;
}

/**
 * Detected keyword from prompt
 */
export interface DetectedKeyword {
  type: string;
  value?: string;
}

/**
 * Project memory structure
 */
export interface ProjectMemory {
  directives?: Array<{ directive: string; priority?: string }>;
  notes?: Record<string, string[]>;
  techStack?: string;
  build?: string;
  conventions?: string;
  structure?: string;
}

/**
 * Mode state structure
 */
export interface ModeState {
  active: boolean;
  skill_name?: string;
  reinforcement_count?: number;
  [key: string]: unknown;
}

/**
 * Hook processing result
 */
export interface HookResult {
  shouldContinue: boolean;
  additionalContext?: string;
  systemMessage?: string;
}

// ============================================
// Slash Command Parsing
// ============================================

/**
 * Parse a slash command from a prompt string.
 *
 * @param prompt - The raw prompt string
 * @returns Parsed command or null if not a slash command
 *
 * @example
 * parseSlashCommand('/autopilot build feature')
 * // Returns: { skill: 'autopilot', args: 'build feature' }
 */
export function parseSlashCommand(prompt: string): SlashCommand | null {
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
 * Check if a skill name is in the list of available skills.
 */
export function isSkillAvailable(skillName: string, availableSkills: string[]): boolean {
  return availableSkills.includes(skillName);
}

// ============================================
// Keyword to Skill Mapping
// ============================================

/**
 * Default keyword to skill mapping.
 */
export const KEYWORD_SKILL_MAP: Record<string, string> = {
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

/**
 * Map a keyword type to a skill name.
 *
 * @param keywordType - The detected keyword type
 * @param customMapping - Optional custom mapping to use
 * @returns Skill name or null if no mapping exists
 */
export function mapKeywordToSkill(
  keywordType: string,
  customMapping: Record<string, string> = KEYWORD_SKILL_MAP
): string | null {
  return customMapping[keywordType] || null;
}

// ============================================
// Context Building
// ============================================

/**
 * Build skill activation context string.
 *
 * @param skillName - Name of the activated skill
 * @param skillDefinition - Content of the skill definition file
 * @returns Formatted context string
 */
export function buildSkillContext(skillName: string, skillDefinition: string): string {
  return `[OMC Skill Activated: ${skillName}]\n\n${skillDefinition}`;
}

/**
 * Build mode activation context string.
 *
 * @param keywordType - Type of the detected keyword/mode
 * @param skillDefinition - Content of the skill definition file
 * @returns Formatted context string
 */
export function buildModeContext(keywordType: string, skillDefinition: string): string {
  return `[OMC Mode: ${keywordType}]\n\n${skillDefinition}`;
}

/**
 * Build project directives context string.
 *
 * @param directives - Array of directive objects
 * @returns Formatted context string
 */
export function buildDirectivesContext(
  directives: Array<{ directive: string; priority?: string }>
): string {
  if (!directives || directives.length === 0) {
    return '';
  }

  let context = '\n## Project Directives\n';
  for (const directive of directives) {
    context += `- ${directive.directive}\n`;
  }
  return context;
}

/**
 * Build project notes context string.
 *
 * @param notes - Record of category to notes array
 * @returns Formatted context string
 */
export function buildNotesContext(notes: Record<string, string[]>): string {
  if (!notes || Object.keys(notes).length === 0) {
    return '';
  }

  let context = '\n## Project Notes\n';
  for (const [category, notesList] of Object.entries(notes)) {
    if (Array.isArray(notesList) && notesList.length > 0) {
      context += `### ${category}\n`;
      for (const note of notesList) {
        context += `- ${note}\n`;
      }
    }
  }
  return context;
}

/**
 * Build active modes context string.
 *
 * @param activeModes - Array of active mode names
 * @returns Formatted context string
 */
export function buildActiveModesContext(activeModes: string[]): string {
  if (!activeModes || activeModes.length === 0) {
    return '';
  }

  let context = '\n## Active OMC Modes\n';
  for (const mode of activeModes) {
    context += `- ${mode}\n`;
  }
  return context;
}

/**
 * Build project memory context from parsed memory object.
 *
 * @param memory - Parsed project memory object
 * @returns Combined context string
 */
export function buildProjectMemoryContext(memory: ProjectMemory): string {
  let context = '';

  if (memory.directives) {
    context += buildDirectivesContext(memory.directives);
  }

  if (memory.notes) {
    context += buildNotesContext(memory.notes);
  }

  return context;
}

// ============================================
// Stop Hook Logic
// ============================================

/**
 * Persistent modes that should prevent stopping.
 */
export const PERSISTENT_MODES = ['autopilot', 'ralph', 'team', 'ultrawork'] as const;
export type PersistentMode = typeof PERSISTENT_MODES[number];

/**
 * Check if a skill state indicates protection is active.
 *
 * @param skillState - The parsed skill state
 * @returns Whether the skill is protected from stopping
 */
export function isSkillProtected(skillState: ModeState): boolean {
  return Boolean(skillState.active && skillState.reinforcement_count && skillState.reinforcement_count > 0);
}

/**
 * Build skill protection message.
 *
 * @param skillName - Name of the protected skill
 * @returns System message string
 */
export function buildSkillProtectionMessage(skillName: string): string {
  return `[SKILL PROTECTION] ${skillName} is still active. Continue working until completion.`;
}

/**
 * Build mode active message.
 *
 * @param modeName - Name of the active mode
 * @returns System message string
 */
export function buildModeActiveMessage(modeName: string): string {
  return `[${modeName.toUpperCase()} MODE ACTIVE] Continue working. Run /oh-my-claudecode:cancel when all tasks are complete.`;
}

/**
 * Check if a mode state is active.
 *
 * @param modeState - The parsed mode state
 * @returns Whether the mode is active
 */
export function isModeActive(modeState: ModeState): boolean {
  return Boolean(modeState.active);
}

// ============================================
// UserPromptSubmit Hook Logic
// ============================================

export interface ProcessPromptParams {
  prompt: string;
  availableSkills: string[];
  detectedKeywords: DetectedKeyword[];
  loadSkillDefinition: (skillName: string) => string | null;
}

export interface ProcessPromptResult {
  additionalContext: string;
  activatedSkill?: string;
  activatedMode?: string;
}

/**
 * Process a user prompt and determine what context to add.
 * This is the main business logic for UserPromptSubmit hook.
 *
 * @param params - Processing parameters
 * @returns Result with context and activation info
 */
export function processUserPrompt(params: ProcessPromptParams): ProcessPromptResult {
  const { prompt, availableSkills, detectedKeywords, loadSkillDefinition } = params;

  let additionalContext = '';
  let activatedSkill: string | undefined;
  let activatedMode: string | undefined;

  // 1. Check for slash command (highest priority)
  const command = parseSlashCommand(prompt);
  if (command && isSkillAvailable(command.skill, availableSkills)) {
    const skillDef = loadSkillDefinition(command.skill);
    if (skillDef) {
      additionalContext = buildSkillContext(command.skill, skillDef);
      activatedSkill = command.skill;
    }
  }

  // 2. Check for keywords (if no slash command activated)
  if (!activatedSkill && detectedKeywords.length > 0) {
    for (const kw of detectedKeywords) {
      const skillName = mapKeywordToSkill(kw.type);
      if (skillName && isSkillAvailable(skillName, availableSkills)) {
        const skillDef = loadSkillDefinition(skillName);
        if (skillDef) {
          additionalContext = buildModeContext(kw.type, skillDef);
          activatedMode = kw.type;
          break; // Only activate first matching mode
        }
      }
    }
  }

  return {
    additionalContext,
    activatedSkill,
    activatedMode
  };
}

// ============================================
// SessionStart Hook Logic
// ============================================

export interface SessionStartParams {
  projectMemory: ProjectMemory | null;
  activeModes: string[];
}

/**
 * Process session start and build context.
 *
 * @param params - Session start parameters
 * @returns Context string to add
 */
export function processSessionStart(params: SessionStartParams): string {
  let context = '';

  if (params.projectMemory) {
    context += buildProjectMemoryContext(params.projectMemory);
  }

  if (params.activeModes.length > 0) {
    context += buildActiveModesContext(params.activeModes);
  }

  return context;
}

// ============================================
// Stop Hook Logic
// ============================================

export interface StopCheckParams {
  skillState: ModeState | null;
  modeStates: Array<{ mode: string; state: ModeState }>;
}

export interface StopCheckResult {
  shouldPreventStop: boolean;
  systemMessage?: string;
  reason?: string;
}

/**
 * Check if the stop should be prevented based on active states.
 *
 * @param params - Stop check parameters
 * @returns Result indicating if stop should be prevented
 */
export function checkShouldPreventStop(params: StopCheckParams): StopCheckResult {
  const { skillState, modeStates } = params;

  // Check skill protection first
  if (skillState && isSkillProtected(skillState)) {
    return {
      shouldPreventStop: true,
      systemMessage: buildSkillProtectionMessage(skillState.skill_name || 'Unknown'),
      reason: 'skill_protected'
    };
  }

  // Check persistent modes
  for (const { mode, state } of modeStates) {
    if (isModeActive(state)) {
      return {
        shouldPreventStop: true,
        systemMessage: buildModeActiveMessage(mode),
        reason: `mode_active:${mode}`
      };
    }
  }

  return {
    shouldPreventStop: false
  };
}

// ============================================
// File Path Helpers
// ============================================

/**
 * Get the project memory file path.
 */
export function getProjectMemoryPath(cwd: string): string {
  return `${cwd}/.omc/project-memory.json`;
}

/**
 * Get the skill state file path.
 */
export function getSkillStatePath(cwd: string): string {
  return `${cwd}/.omc/state/skill-active-state.json`;
}

/**
 * Get a mode state file path.
 * When sessionId is provided, uses session-scoped path.
 */
export function getModeStatePath(cwd: string, mode: string, sessionId?: string): string {
  if (sessionId) {
    return `${cwd}/.omc/state/sessions/${sessionId}/${mode}-state.json`;
  }
  return `${cwd}/.omc/state/${mode}-state.json`;
}

/**
 * Get all possible mode state paths (session-scoped first, then legacy).
 * Useful for fallback reading.
 */
export function getModeStatePaths(cwd: string, mode: string, sessionId?: string): string[] {
  const paths: string[] = [];
  if (sessionId) {
    paths.push(`${cwd}/.omc/state/sessions/${sessionId}/${mode}-state.json`);
  }
  paths.push(`${cwd}/.omc/state/${mode}-state.json`);
  return paths;
}

/**
 * Get skill definition file paths to try.
 */
export function getSkillDefinitionPaths(skillsPath: string, skillName: string): string[] {
  return [
    `${skillsPath}/${skillName}/SKILL.md`,
    `${skillsPath}/${skillName}/index.md`,
    `${skillsPath}/${skillName}/README.md`
  ];
}
