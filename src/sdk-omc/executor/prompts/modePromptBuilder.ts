/**
 * Mode Prompt Builder
 * Single Responsibility: Build mode-specific prompts for persistent execution
 *
 * Uses declarative mode definitions for easy extension and maintenance.
 */

import type { SkillMode } from '../../types';

/**
 * Query result from a previous iteration
 */
export interface QueryResult {
  success: boolean;
  response: string;
  toolsUsed: string[];
  error?: string;
}

/**
 * Mode definition with prompt templates
 */
export interface ModeDefinition {
  /** Initial prompt template with {{task}} placeholder */
  initialPromptTemplate: string;
  /** Whether this mode uses the full template or just passes the task through */
  useTemplate: boolean;
}

/**
 * Declarative mode definitions
 */
const MODE_DEFINITIONS: Record<SkillMode, ModeDefinition> = {
  ralph: {
    useTemplate: true,
    initialPromptTemplate: `You are in RALPH mode - a persistent execution loop that continues until the task is complete.

TASK: {{task}}

INSTRUCTIONS:
1. Work on this task systematically
2. Use all necessary tools (Read, Write, Edit, Bash, etc.)
3. Do NOT stop until the task is fully complete
4. After each major step, assess if the task is complete
5. If complete, clearly state "TASK COMPLETE" and summarize what was done

Begin working on the task now.`,
  },

  autopilot: {
    useTemplate: true,
    initialPromptTemplate: `You are in AUTOPILOT mode - full autonomous execution from planning to completion.

GOAL: {{task}}

PHASES:
1. PLANNING - Analyze requirements and create a plan
2. IMPLEMENTING - Execute the plan step by step
3. TESTING - Verify the implementation works
4. VERIFICATION - Final checks and cleanup

Work through each phase systematically. Do NOT stop until all phases are complete.

Begin with the PLANNING phase.`,
  },

  team: { useTemplate: false, initialPromptTemplate: '' },
  ultrawork: { useTemplate: false, initialPromptTemplate: '' },
  ultrapilot: { useTemplate: false, initialPromptTemplate: '' },
  pipeline: { useTemplate: false, initialPromptTemplate: '' },
  plan: { useTemplate: false, initialPromptTemplate: '' },
};

/**
 * ModePromptBuilder creates prompts for persistent mode execution
 */
export class ModePromptBuilder {
  private defaultContinuePrompt: string;

  constructor(defaultContinuePrompt: string = 'Continue working on the task. Remember: do NOT stop until the task is fully complete.') {
    this.defaultContinuePrompt = defaultContinuePrompt;
  }

  /**
   * Build initial prompt for the mode
   *
   * @param mode - The skill mode
   * @param task - The task description
   * @returns The formatted initial prompt
   */
  buildInitialPrompt(mode: SkillMode, task: string): string {
    const definition = MODE_DEFINITIONS[mode];

    if (!definition || !definition.useTemplate) {
      return task;
    }

    return definition.initialPromptTemplate.replace('{{task}}', task);
  }

  /**
   * Build continuation prompt
   *
   * @param mode - The skill mode
   * @param lastResult - Result from the previous iteration
   * @param customContinuePrompt - Optional custom continue prompt
   * @returns The formatted continuation prompt
   */
  buildContinuePrompt(
    mode: SkillMode,
    lastResult: QueryResult | null,
    customContinuePrompt?: string
  ): string {
    let prompt = customContinuePrompt || this.defaultContinuePrompt;

    if (lastResult?.error) {
      prompt += `\n\nThe previous iteration encountered an issue: ${lastResult.error}\nPlease address this and continue.`;
    }

    return prompt;
  }

  /**
   * Check if a mode uses a template (vs passing task through)
   */
  usesTemplate(mode: SkillMode): boolean {
    return MODE_DEFINITIONS[mode]?.useTemplate ?? false;
  }

  /**
   * Get available modes that use templates
   */
  getTemplatedModes(): SkillMode[] {
    return (Object.entries(MODE_DEFINITIONS) as [SkillMode, ModeDefinition][])
      .filter(([_, def]) => def.useTemplate)
      .map(([mode]) => mode);
  }
}

/**
 * Create a new ModePromptBuilder instance
 */
export function createModePromptBuilder(defaultContinuePrompt?: string): ModePromptBuilder {
  return new ModePromptBuilder(defaultContinuePrompt);
}
