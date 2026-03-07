/**
 * Hook Builder Module
 * Single Responsibility: Build and merge SDK hooks
 *
 * This module handles:
 * - Building base hooks for agent lifecycle tracking
 * - Merging multiple hook sets together
 * - Building query options with hooks
 *
 * Usage:
 *   const baseHooks = buildBaseHooks({ onAgentStart, onAgentStop });
 *   const mergedHooks = mergeHooks(baseHooks, omcHooks);
 */

export interface AgentStartEvent {
  agentId: string;
  agentType: string;
}

export interface AgentStopEvent {
  agentId: string;
  transcriptPath?: string;
}

export interface HookCallbacks {
  onAgentStart: (event: AgentStartEvent) => void;
  onAgentStop: (event: AgentStopEvent) => void;
}

export interface HookInput {
  agent_id?: string;
  agent_type?: string;
  subagent_type?: string;
  type?: string;
  agent_transcript_path?: string;
}

export interface HookResult {
  continue: boolean;
}

export type HookFunction = (input: HookInput) => Promise<HookResult>;

export interface HookEntry {
  hooks: HookFunction[];
}

export interface SDKHooks {
  SubagentStart?: HookEntry[];
  SubagentStop?: HookEntry[];
  [key: string]: HookEntry[] | undefined;
}

/**
 * Build base hooks for agent lifecycle tracking.
 * These hooks emit events when agents start and stop.
 *
 * @param callbacks - Callback functions for agent events
 * @returns SDK hooks object
 */
export function buildBaseHooks(callbacks: HookCallbacks): SDKHooks {
  return {
    SubagentStart: [{
      hooks: [async (input: HookInput): Promise<HookResult> => {
        // Try to get the agent type from various possible fields
        const agentType = input.subagent_type || input.agent_type || input.type || 'unknown';

        callbacks.onAgentStart({
          agentId: input.agent_id || '',
          agentType
        });

        return { continue: true };
      }]
    }],
    SubagentStop: [{
      hooks: [async (input: HookInput): Promise<HookResult> => {
        callbacks.onAgentStop({
          agentId: input.agent_id || '',
          transcriptPath: input.agent_transcript_path
        });

        return { continue: true };
      }]
    }]
  };
}

/**
 * Merge two hook sets together.
 * Hooks from both sets will be executed in sequence.
 *
 * @param baseHooks - The base hooks
 * @param additionalHooks - Additional hooks to merge in
 * @returns Merged hooks object
 */
export function mergeHooks(baseHooks: SDKHooks, additionalHooks: SDKHooks | null): SDKHooks {
  if (!additionalHooks) {
    return baseHooks;
  }

  const merged: SDKHooks = { ...baseHooks };

  for (const key of Object.keys(additionalHooks)) {
    const additionalEntries = additionalHooks[key];
    if (!additionalEntries) continue;

    if (merged[key]) {
      // Merge hook entries
      merged[key] = [...merged[key]!, ...additionalEntries];
    } else {
      merged[key] = additionalEntries;
    }
  }

  return merged;
}

export interface QueryParams {
  workingDirectory: string;
  model?: string;
  abortController?: AbortController;
  hooks?: SDKHooks;
  agents?: Record<string, unknown>;
}

export interface QueryOptions {
  cwd: string;
  model?: string;
  abortController?: AbortController;
  permissionMode: string;
  allowDangerouslySkipPermissions: boolean;
  includePartialMessages: boolean;
  pathToClaudeCodeExecutable: string;
  hooks?: SDKHooks;
  agents?: Record<string, unknown>;
}

/**
 * Build query options for the SDK.
 *
 * @param params - Query parameters
 * @returns SDK query options object
 */
export function buildQueryOptions(params: QueryParams): QueryOptions {
  return {
    cwd: params.workingDirectory,
    model: params.model,
    abortController: params.abortController,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    includePartialMessages: true,
    pathToClaudeCodeExecutable: '/opt/homebrew/bin/claude',
    hooks: params.hooks,
    agents: params.agents
  };
}
