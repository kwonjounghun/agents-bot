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
  toolUseId?: string;  // The tool_use_id that spawned this agent (for message routing)
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
  // Tool use ID that spawned this subagent (for message routing)
  tool_use_id?: string;
  // Additional fields that SDK might pass
  hook_event_name?: string;
  session_id?: string;
  cwd?: string;
  // Catch-all for any other fields
  [key: string]: unknown;
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
        // Debug: Log all fields received from SDK
        console.log('[HookBuilder] SubagentStart input:', JSON.stringify(input, null, 2));

        // Try to get the agent type from various possible fields
        // SDK passes: agent_type (internal type) and potentially subagent_type (user-specified)
        const agentType = input.subagent_type || input.agent_type || input.type || 'unknown';

        console.log('[HookBuilder] Resolved agentType:', agentType,
          '(subagent_type:', input.subagent_type,
          ', agent_type:', input.agent_type,
          ', type:', input.type,
          ', tool_use_id:', input.tool_use_id, ')');

        callbacks.onAgentStart({
          agentId: input.agent_id || '',
          agentType,
          toolUseId: input.tool_use_id
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
