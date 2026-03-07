/**
 * SDK-OMC Hooks
 *
 * Hook implementations for keyword detection, mode protection,
 * and agent coordination. Compatible with Claude Agent SDK hook system.
 */

import type {
  HookInput,
  HookOutput,
  DetectedKeyword,
  KeywordType,
  SkillMode
} from './types';
import { listActiveModes } from './state';

// SDK HookCallback type
export type HookCallback = (
  input: HookInput,
  toolUseId?: string,
  context?: { signal?: AbortSignal }
) => Promise<HookOutput>;

/**
 * Magic keywords that trigger skill activation
 */
const MAGIC_KEYWORDS: Record<string, SkillMode> = {
  'autopilot': 'autopilot',
  'ralph': 'ralph',
  'team': 'team',
  'ultrawork': 'ultrawork',
  'ultrapilot': 'ultrapilot',
  'pipeline': 'pipeline',
  'plan': 'plan'
};

/**
 * Agent reference patterns (e.g., @executor, @architect)
 */
const AGENT_REFERENCES = [
  'explore', 'planner', 'executor', 'architect', 'debugger', 'verifier',
  'analyst', 'code-reviewer', 'security-reviewer', 'quality-reviewer',
  'designer', 'test-engineer', 'writer', 'qa-tester', 'scientist',
  'document-specialist', 'critic', 'deep-executor'
];

/**
 * Detect magic keywords in prompt
 */
export function detectMagicKeywords(prompt: string): DetectedKeyword[] {
  const lower = prompt.toLowerCase();
  const detected: DetectedKeyword[] = [];

  for (const [keyword, mode] of Object.entries(MAGIC_KEYWORDS)) {
    const index = lower.indexOf(keyword);
    if (index !== -1) {
      detected.push({
        type: 'magic-keyword',
        keyword,
        position: index
      });
    }
  }

  return detected;
}

/**
 * Detect agent references in prompt (e.g., @executor)
 */
export function detectAgentReferences(prompt: string): DetectedKeyword[] {
  const detected: DetectedKeyword[] = [];

  for (const agent of AGENT_REFERENCES) {
    const pattern = new RegExp(`@${agent}\\b`, 'gi');
    const match = pattern.exec(prompt);
    if (match) {
      detected.push({
        type: 'agent-reference',
        keyword: agent,
        position: match.index
      });
    }
  }

  return detected;
}

/**
 * Detect skill invocation patterns (e.g., /autopilot)
 */
export function detectSkillPatterns(prompt: string): DetectedKeyword[] {
  const detected: DetectedKeyword[] = [];

  const skillPattern = /\/([a-z-]+)/gi;
  let match;

  while ((match = skillPattern.exec(prompt)) !== null) {
    const skillName = match[1].toLowerCase();
    if (MAGIC_KEYWORDS[skillName]) {
      detected.push({
        type: 'skill-keyword',
        keyword: skillName,
        position: match.index
      });
    }
  }

  return detected;
}

/**
 * Detect all keywords with type information
 */
export function detectKeywordsWithType(prompt: string): DetectedKeyword[] {
  return [
    ...detectMagicKeywords(prompt),
    ...detectAgentReferences(prompt),
    ...detectSkillPatterns(prompt)
  ];
}

/**
 * Extract clean prompt text (remove code blocks, etc.)
 */
export function extractPromptText(fullInput: string): string {
  // Remove code blocks
  let text = fullInput.replace(/```[\s\S]*?```/g, '');
  // Remove inline code
  text = text.replace(/`[^`]+`/g, '');
  return text.trim();
}

/**
 * Keyword Detection Hook
 *
 * Detects magic keywords and injects appropriate context.
 */
export const keywordDetectionHook: HookCallback = async (input, toolUseId, context) => {
  if (input.hook_event_name !== 'UserPromptSubmit') {
    return {};
  }

  const prompt = input.prompt || '';
  const cleanPrompt = extractPromptText(prompt);
  const keywords = detectKeywordsWithType(cleanPrompt);

  if (keywords.length === 0) {
    return {};
  }

  // Find the primary mode keyword
  const modeKeyword = keywords.find(k => k.type === 'magic-keyword' || k.type === 'skill-keyword');

  if (modeKeyword) {
    const mode = modeKeyword.keyword.toUpperCase();
    return {
      systemMessage: `[OMC MODE: ${mode}] ${getModeDescription(modeKeyword.keyword)}`,
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: `Detected keyword: ${modeKeyword.keyword}. Activating ${mode} mode.`
      }
    };
  }

  // Check for agent references
  const agentRef = keywords.find(k => k.type === 'agent-reference');
  if (agentRef) {
    return {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: `Agent reference detected: @${agentRef.keyword}. Use the ${agentRef.keyword} agent for this task.`
      }
    };
  }

  return {};
};

/**
 * Get description for a mode
 */
function getModeDescription(mode: string): string {
  const descriptions: Record<string, string> = {
    autopilot: 'Full autonomous execution activated. Planning, implementing, and verifying systematically.',
    ralph: 'Persistent loop activated. Will continue until task is complete with architect verification.',
    team: 'Multi-agent coordination activated. Spawning specialized agents.',
    ultrawork: 'Maximum parallelism activated. Executing tasks in parallel.',
    ultrapilot: 'Parallel autopilot activated. Running multiple workflows concurrently.',
    pipeline: 'Sequential pipeline activated. Chaining agents with data passing.',
    plan: 'Planning mode activated. Exploring and designing before implementation.'
  };

  return descriptions[mode] || 'Mode activated.';
}

/**
 * Mode Protection Hook
 *
 * Prevents stopping while persistent modes are active.
 */
export const modeProtectionHook: HookCallback = async (input, toolUseId, context) => {
  if (input.hook_event_name !== 'Stop') {
    return {};
  }

  try {
    const activeModes = await listActiveModes(input.cwd);

    if (activeModes.length > 0) {
      const modeList = activeModes.join(', ').toUpperCase();
      return {
        continue: true, // Prevent stop
        systemMessage: `[ACTIVE MODES: ${modeList}] Cannot stop while persistent modes are active. Complete the current task or use /cancel to explicitly stop.`
      };
    }
  } catch (error) {
    // If we can't read state, allow stop
    console.error('[SDK-OMC] Error checking active modes:', error);
  }

  return {};
};

/**
 * Coordination Hook
 *
 * Tracks agent lifecycle events for coordination.
 */
export const coordinationHook: HookCallback = async (input, toolUseId, context) => {
  if (input.hook_event_name === 'SubagentStart') {
    const agentType = (input as any).agent_type || 'unknown';
    const agentId = (input as any).agent_id || 'unknown';
    console.log(`[SDK-OMC] Agent started: ${agentType} (${agentId})`);
    // Could emit event for UI to spawn widget
  }

  if (input.hook_event_name === 'SubagentStop') {
    const agentId = (input as any).agent_id || 'unknown';
    console.log(`[SDK-OMC] Agent completed: ${agentId}`);
    // Could emit event for UI to close widget
  }

  return {};
};

/**
 * Session Start Hook
 *
 * Initializes session context and loads project memory.
 */
export const sessionStartHook: HookCallback = async (input, toolUseId, context) => {
  if (input.hook_event_name !== 'SessionStart') {
    return {};
  }

  try {
    const activeModes = await listActiveModes(input.cwd);

    if (activeModes.length > 0) {
      const modeList = activeModes.join(', ');
      return {
        systemMessage: `[SDK-OMC] Active modes detected: ${modeList}. Resuming previous session.`
      };
    }
  } catch (error) {
    // Ignore errors during session start
  }

  return {};
};

/**
 * Create all OMC hooks
 */
export function createOmcHooks(): Record<string, Array<{ hooks: HookCallback[] }>> {
  return {
    UserPromptSubmit: [{ hooks: [keywordDetectionHook] }],
    Stop: [{ hooks: [modeProtectionHook] }],
    SubagentStart: [{ hooks: [coordinationHook] }],
    SubagentStop: [{ hooks: [coordinationHook] }],
    SessionStart: [{ hooks: [sessionStartHook] }]
  };
}

/**
 * Merge hooks with existing hooks
 */
export function mergeHooks(
  existing: Record<string, Array<{ hooks: HookCallback[] }>>,
  omcHooks: Record<string, Array<{ hooks: HookCallback[] }>>
): Record<string, Array<{ hooks: HookCallback[] }>> {
  const merged = { ...existing };

  for (const [event, hooks] of Object.entries(omcHooks)) {
    if (merged[event]) {
      // Prepend OMC hooks (run first)
      merged[event] = [...hooks, ...merged[event]];
    } else {
      merged[event] = hooks;
    }
  }

  return merged;
}
