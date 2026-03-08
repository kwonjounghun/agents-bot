/**
 * SDK-OMC Skills
 *
 * Skills implemented as MCP tools using createSdkMcpServer.
 * These mirror oh-my-claudecode's skill system.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  readState,
  writeState,
  clearState,
  listActiveModes,
  createAutopilotState,
  createRalphState,
  createTeamState,
  completeMode,
  failMode,
  incrementIteration
} from './state';
import type { SkillMode, ModeState, SkillResult } from './types';

/**
 * Tool execution context
 */
export interface ToolContext {
  cwd?: string;
  session_id?: string;
}

/**
 * Tool definition interface (compatible with SDK's tool() helper)
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>, context?: ToolContext) => Promise<ToolResult>;
}

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
}

// Import additional tools
import { lspTools } from './tools/lsp-tools';
import { traceTools } from './tools/trace-tools';
import { memoryTools } from './tools/memory-tools';
import { notepadTools } from './tools/notepad-tools';
import { astTools } from './tools/ast-tools';
import { teamTools } from './tools/team-tools';

/**
 * Autopilot Skill
 *
 * Full autonomous execution from idea to working code.
 * Runs plan -> execute -> verify loop.
 */
export const autopilotTool: ToolDefinition = {
  name: 'autopilot',
  description: 'Full autonomous execution from idea to working code. Runs plan -> execute -> verify loop until completion.',
  inputSchema: {
    type: 'object',
    properties: {
      goal: {
        type: 'string',
        description: 'The goal to achieve'
      },
      maxIterations: {
        type: 'number',
        description: 'Maximum iterations before stopping',
        default: 10
      }
    },
    required: ['goal']
  },
  handler: async (args, context) => {
    const goal = args.goal as string;
    const maxIterations = (args.maxIterations as number) || 10;
    const cwd = context?.cwd || process.cwd();
    const sessionId = context?.session_id;
    const stateOptions = sessionId ? { sessionId } : undefined;

    // Create autopilot state
    const state = createAutopilotState(goal);
    state.maxIterations = maxIterations;
    await writeState('autopilot', state, cwd, stateOptions);

    return {
      content: [{
        type: 'text',
        text: `[AUTOPILOT ACTIVATED]

Goal: ${goal}
Max Iterations: ${maxIterations}

Starting autonomous execution loop:
1. Planning phase - Analyze and decompose the task
2. Execution phase - Implement using executor agents
3. Verification phase - Verify with verifier agent
4. Fix loop if needed - Iterate until complete

Use the planner agent to create a plan, then executor agents to implement, and verifier to check completion.`
      }]
    };
  }
};

/**
 * Ralph Skill
 *
 * Self-referential loop until task completion with architect verification.
 */
export const ralphTool: ToolDefinition = {
  name: 'ralph',
  description: 'Persistent loop until task completion with architect verification. Will not stop until task is verified complete.',
  inputSchema: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'The task to complete'
      },
      maxIterations: {
        type: 'number',
        description: 'Maximum iterations before forced stop',
        default: 20
      }
    },
    required: ['task']
  },
  handler: async (args, context) => {
    const task = args.task as string;
    const maxIterations = (args.maxIterations as number) || 20;
    const cwd = context?.cwd || process.cwd();
    const sessionId = context?.session_id;
    const stateOptions = sessionId ? { sessionId } : undefined;

    // Create ralph state
    const state = createRalphState(task, maxIterations);
    await writeState('ralph', state, cwd, stateOptions);

    return {
      content: [{
        type: 'text',
        text: `[RALPH LOOP ACTIVATED]

Task: ${task}
Max Iterations: ${maxIterations}

The boulder never stops. Continuing until task is verified complete.

Each iteration:
1. Execute work toward the goal
2. Check completion criteria
3. If incomplete, continue to next iteration
4. If complete, architect verification before stopping

Current iteration: 1/${maxIterations}`
      }]
    };
  }
};

/**
 * Ultrawork Skill
 *
 * Maximum parallelism with parallel agent orchestration.
 */
export const ultraworkTool: ToolDefinition = {
  name: 'ultrawork',
  description: 'Maximum parallelism with parallel agent orchestration. Spawns multiple agents to work concurrently.',
  inputSchema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of tasks to execute in parallel'
      }
    },
    required: ['tasks']
  },
  handler: async (args, context) => {
    const tasks = args.tasks as string[];
    const cwd = context?.cwd || process.cwd();
    const sessionId = context?.session_id;
    const stateOptions = sessionId ? { sessionId } : undefined;

    // Create ultrawork state
    await writeState('ultrawork', {
      active: true,
      startedAt: new Date().toISOString(),
      currentPhase: 'parallel-execution',
      taskDescription: `Parallel execution of ${tasks.length} tasks`
    }, cwd, stateOptions);

    return {
      content: [{
        type: 'text',
        text: `[ULTRAWORK ACTIVATED]

Parallel execution of ${tasks.length} tasks:
${tasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Spawning parallel agents for each task. Use the Task tool to spawn subagents concurrently.`
      }]
    };
  }
};

/**
 * Team Skill
 *
 * Coordinated multi-agent execution with staged pipeline.
 */
export const teamTool: ToolDefinition = {
  name: 'team',
  description: 'Coordinated multi-agent execution with staged pipeline (plan -> prd -> exec -> verify -> fix).',
  inputSchema: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'The task for the team to complete'
      },
      agentCount: {
        type: 'number',
        description: 'Number of agents to spawn',
        default: 3
      },
      agentType: {
        type: 'string',
        description: 'Type of agents to spawn (executor, designer, etc.)',
        default: 'executor'
      }
    },
    required: ['task']
  },
  handler: async (args, context) => {
    const task = args.task as string;
    const agentCount = (args.agentCount as number) || 3;
    const agentType = (args.agentType as string) || 'executor';
    const cwd = context?.cwd || process.cwd();
    const sessionId = context?.session_id;
    const stateOptions = sessionId ? { sessionId } : undefined;

    // Generate team name from task
    const teamName = task
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 30);

    // Create team state
    const state = createTeamState(teamName, agentCount, task);
    state.agentTypes = agentType;
    await writeState('team', state, cwd, stateOptions);

    return {
      content: [{
        type: 'text',
        text: `[TEAM ACTIVATED]

Team: ${teamName}
Task: ${task}
Agents: ${agentCount} x ${agentType}

Pipeline stages:
1. team-plan: Explore and decompose task
2. team-prd: Define acceptance criteria
3. team-exec: Execute with parallel agents
4. team-verify: Verify completion
5. team-fix: Fix issues (loop if needed)

Starting with team-plan phase. Use planner and explore agents to analyze the task.`
      }]
    };
  }
};

/**
 * State Read Tool
 */
export const stateReadTool: ToolDefinition = {
  name: 'state_read',
  description: 'Read mode state (autopilot, ralph, team, ultrawork, etc.)',
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['autopilot', 'ralph', 'team', 'ultrawork', 'ultrapilot', 'pipeline', 'plan'],
        description: 'Mode to read state for'
      }
    },
    required: ['mode']
  },
  handler: async (args, context) => {
    const mode = args.mode as SkillMode;
    const cwd = context?.cwd || process.cwd();
    const sessionId = context?.session_id;
    const stateOptions = sessionId ? { sessionId } : undefined;

    const state = await readState(mode, cwd, stateOptions);

    if (!state) {
      return {
        content: [{
          type: 'text',
          text: `No active state for mode: ${mode}`
        }]
      };
    }

    return {
      content: [{
        type: 'text',
        text: `State for ${mode}:\n${JSON.stringify(state, null, 2)}`
      }]
    };
  }
};

/**
 * State Write Tool
 */
export const stateWriteTool: ToolDefinition = {
  name: 'state_write',
  description: 'Write/update mode state',
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['autopilot', 'ralph', 'team', 'ultrawork', 'ultrapilot', 'pipeline', 'plan'],
        description: 'Mode to write state for'
      },
      state: {
        type: 'object',
        description: 'State object to write'
      }
    },
    required: ['mode', 'state']
  },
  handler: async (args, context) => {
    const mode = args.mode as SkillMode;
    const state = args.state as ModeState;
    const cwd = context?.cwd || process.cwd();
    const sessionId = context?.session_id;
    const stateOptions = sessionId ? { sessionId } : undefined;

    await writeState(mode, state, cwd, stateOptions);

    return {
      content: [{
        type: 'text',
        text: `State written for ${mode}`
      }]
    };
  }
};

/**
 * State Clear Tool
 */
export const stateClearTool: ToolDefinition = {
  name: 'state_clear',
  description: 'Clear mode state (deactivate mode)',
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['autopilot', 'ralph', 'team', 'ultrawork', 'ultrapilot', 'pipeline', 'plan'],
        description: 'Mode to clear state for'
      }
    },
    required: ['mode']
  },
  handler: async (args, context) => {
    const mode = args.mode as SkillMode;
    const cwd = context?.cwd || process.cwd();
    const sessionId = context?.session_id;
    const stateOptions = sessionId ? { sessionId } : undefined;

    await clearState(mode, cwd, stateOptions);

    return {
      content: [{
        type: 'text',
        text: `State cleared for ${mode}`
      }]
    };
  }
};

/**
 * List Active Modes Tool
 */
export const listActiveModesTool: ToolDefinition = {
  name: 'list_active_modes',
  description: 'List all currently active modes',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async (args, context) => {
    const cwd = context?.cwd || process.cwd();
    const sessionId = context?.session_id;
    const stateOptions = sessionId ? { sessionId } : undefined;

    const activeModes = await listActiveModes(cwd, stateOptions);

    if (activeModes.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No active modes'
        }]
      };
    }

    return {
      content: [{
        type: 'text',
        text: `Active modes: ${activeModes.join(', ')}`
      }]
    };
  }
};

/**
 * Cancel Mode Tool
 */
export const cancelModeTool: ToolDefinition = {
  name: 'cancel',
  description: 'Cancel active mode(s)',
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['autopilot', 'ralph', 'team', 'ultrawork', 'ultrapilot', 'pipeline', 'plan', 'all'],
        description: 'Mode to cancel (or "all" for all modes)'
      },
      force: {
        type: 'boolean',
        description: 'Force cancellation without cleanup',
        default: false
      }
    },
    required: ['mode']
  },
  handler: async (args, context) => {
    const mode = args.mode as string;
    const cwd = context?.cwd || process.cwd();
    const sessionId = context?.session_id;
    const stateOptions = sessionId ? { sessionId } : undefined;

    if (mode === 'all') {
      const activeModes = await listActiveModes(cwd, stateOptions);
      for (const m of activeModes) {
        await clearState(m, cwd, stateOptions);
      }
      return {
        content: [{
          type: 'text',
          text: `Cancelled all modes: ${activeModes.join(', ')}`
        }]
      };
    }

    await clearState(mode as SkillMode, cwd, stateOptions);

    return {
      content: [{
        type: 'text',
        text: `Cancelled mode: ${mode}`
      }]
    };
  }
};

/**
 * All skill tools
 */
export const omcSkillTools: ToolDefinition[] = [
  // Core skills
  autopilotTool,
  ralphTool,
  ultraworkTool,
  teamTool,
  // State management
  stateReadTool,
  stateWriteTool,
  stateClearTool,
  listActiveModesTool,
  cancelModeTool,
  // Additional tools from tools/ directory
  ...lspTools,
  ...traceTools,
  ...memoryTools,
  ...notepadTools,
  ...astTools,
  ...teamTools
];

/**
 * Get tool by name
 */
export function getSkillTool(name: string): ToolDefinition | undefined {
  return omcSkillTools.find(t => t.name === name);
}

/**
 * List all skill tool names
 */
export function listSkillToolNames(): string[] {
  return omcSkillTools.map(t => t.name);
}
