/**
 * Prompt Processor Module
 * Single Responsibility: Parse and transform prompts (slash commands, skill loading)
 *
 * This module handles:
 * - Slash command parsing (/skill-name args)
 * - Skill definition loading from filesystem
 * - Final prompt assembly with contexts
 *
 * Usage:
 *   const command = parseSlashCommand('/autopilot build feature');
 *   const skillDef = loadSkillDefinition('autopilot', '/path/to/skills');
 *   const finalPrompt = buildFinalPrompt(prompt, skillContext, omcContext);
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface SlashCommand {
  skill: string;
  args: string;
}

export interface ProcessedPrompt {
  prompt: string;
  skillContext?: string;
}

/**
 * Parse a slash command from a prompt string.
 *
 * @param prompt - The raw prompt string
 * @returns Parsed command object or null if not a slash command
 *
 * @example
 * parseSlashCommand('/autopilot build feature')
 * // Returns: { skill: 'autopilot', args: 'build feature' }
 *
 * parseSlashCommand('regular prompt')
 * // Returns: null
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
 * Load a skill definition file from the skills directory.
 * Tries multiple possible filenames in order.
 *
 * @param skillName - Name of the skill to load
 * @param skillsPath - Path to the skills directory
 * @returns Skill definition content or null if not found
 */
export function loadSkillDefinition(skillName: string, skillsPath: string): string | null {
  if (!skillsPath) {
    return null;
  }

  const skillDir = join(skillsPath, skillName);
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
 * Build the final prompt by combining the base prompt with optional contexts.
 *
 * @param basePrompt - The original prompt
 * @param skillContext - Optional skill definition context
 * @param omcContext - Optional OMC mode context
 * @returns The assembled final prompt
 */
export function buildFinalPrompt(
  basePrompt: string,
  skillContext?: string,
  omcContext?: string
): string {
  let finalPrompt = basePrompt;

  // Add skill context first (appears before the prompt)
  if (skillContext) {
    finalPrompt = `${skillContext}\n\n---\n\nUser Request:\n${basePrompt}`;
  }

  // Add OMC context at the beginning
  if (omcContext) {
    finalPrompt = `${omcContext}\n${finalPrompt}`;
  }

  return finalPrompt;
}

/**
 * Build OMC agent context string for SDK-OMC mode.
 *
 * @param agents - Map of agent names to definitions
 * @param suggestedMode - Optional suggested mode from keyword detection
 * @returns OMC context string to prepend to prompt
 */
export function buildOmcAgentContext(
  agents: Record<string, { description: string }>,
  suggestedMode?: string
): string {
  let context = '';

  if (suggestedMode) {
    context += `[SDK-OMC MODE: ${suggestedMode.toUpperCase()}]\n`;
  }

  const agentList = Object.entries(agents)
    .map(([name, def]) => `- ${name}: ${def.description}`)
    .join('\n');

  context += `
<available_agents>
When using the Task tool, use these specialized agent types:
${agentList}

Example: Task(subagent_type="executor", prompt="Implement the feature...")
</available_agents>
`;

  return context;
}

export interface OMCInstallation {
  isInstalled: boolean;
  skillsPath?: string;
}

/**
 * Process an OMC command and return transformed prompt with skill context.
 *
 * @param prompt - The raw prompt string
 * @param installation - OMC installation info
 * @param availableSkills - List of available skill names
 * @returns Processed prompt with optional skill context
 */
export function processOMCCommand(
  prompt: string,
  installation: OMCInstallation,
  availableSkills: string[]
): ProcessedPrompt {
  if (!installation.isInstalled) {
    return { prompt };
  }

  const command = parseSlashCommand(prompt);

  if (!command) {
    return { prompt };
  }

  if (!availableSkills.includes(command.skill)) {
    console.log(`[PromptProcessor] Unknown skill: ${command.skill}`);
    return { prompt };
  }

  console.log(`[PromptProcessor] Processing skill: ${command.skill}`);

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
