/**
 * SDK-OMC Team Tools
 *
 * Team orchestration tools for coordinated multi-agent execution.
 * Supports both Claude Code native teams and tmux-based CLI workers.
 *
 * Pipeline: team-plan -> team-prd -> team-exec -> team-verify -> team-fix
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ToolDefinition } from '../skills';
import { readState, writeState, clearState } from '../state';

/**
 * Team member definition
 */
interface TeamMember {
  name: string;
  role: string;
  agentType: string;
  status: 'idle' | 'working' | 'completed' | 'failed';
  currentTask?: string;
}

/**
 * Team task definition
 */
interface TeamTask {
  id: string;
  title: string;
  description: string;
  assignee?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  stage: TeamStage;
  createdAt: string;
  completedAt?: string;
  result?: string;
}

/**
 * Team stages
 */
type TeamStage = 'team-plan' | 'team-prd' | 'team-exec' | 'team-verify' | 'team-fix';

/**
 * Team state (with index signature for ModeState compatibility)
 */
interface TeamState {
  [key: string]: unknown;
  active: boolean;
  teamName: string;
  startedAt: string;
  currentPhase: TeamStage;
  taskDescription: string;
  members: TeamMember[];
  tasks: TeamTask[];
  fixLoopCount: number;
  maxFixLoops: number;
  linkedRalph?: boolean;
  stageHistory: Array<{
    stage: TeamStage;
    startedAt: string;
    completedAt?: string;
    status: 'running' | 'completed' | 'failed';
  }>;
}

const TEAM_DIR = 'team';

/**
 * Get team directory path
 */
function getTeamDir(workingDirectory: string): string {
  return path.join(workingDirectory, '.omc', TEAM_DIR);
}

/**
 * Ensure team directory exists
 */
function ensureTeamDir(workingDirectory: string): void {
  const teamDir = getTeamDir(workingDirectory);
  if (!fs.existsSync(teamDir)) {
    fs.mkdirSync(teamDir, { recursive: true });
  }
}

/**
 * Generate unique task ID
 */
function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Get stage agents based on team pipeline
 */
function getStageAgents(stage: TeamStage): string[] {
  const stageAgents: Record<TeamStage, string[]> = {
    'team-plan': ['explore', 'planner', 'analyst', 'architect'],
    'team-prd': ['analyst', 'critic'],
    'team-exec': ['executor', 'designer', 'build-fixer', 'writer', 'test-engineer', 'deep-executor'],
    'team-verify': ['verifier', 'security-reviewer', 'code-reviewer', 'quality-reviewer'],
    'team-fix': ['executor', 'build-fixer', 'debugger']
  };
  return stageAgents[stage] || ['executor'];
}

/**
 * Team Create Tool
 */
export const teamCreateTool: ToolDefinition = {
  name: 'team_create',
  description: 'Create a new team for coordinated multi-agent execution. Sets up team state and initializes the pipeline.',
  inputSchema: {
    type: 'object',
    properties: {
      teamName: {
        type: 'string',
        description: 'Unique name for the team (slug format)'
      },
      task: {
        type: 'string',
        description: 'The main task for the team to complete'
      },
      memberCount: {
        type: 'number',
        description: 'Number of team members to spawn',
        default: 3
      },
      linkedRalph: {
        type: 'boolean',
        description: 'Link with ralph for persistent execution',
        default: false
      }
    },
    required: ['teamName', 'task']
  },
  handler: async (args, context) => {
    const teamName = args.teamName as string;
    const task = args.task as string;
    const memberCount = (args.memberCount as number) || 3;
    const linkedRalph = args.linkedRalph as boolean || false;
    const cwd = context?.cwd || process.cwd();

    ensureTeamDir(cwd);

    // Create initial team state
    const teamState: TeamState = {
      active: true,
      teamName,
      startedAt: new Date().toISOString(),
      currentPhase: 'team-plan',
      taskDescription: task,
      members: [],
      tasks: [],
      fixLoopCount: 0,
      maxFixLoops: 3,
      linkedRalph,
      stageHistory: [{
        stage: 'team-plan',
        startedAt: new Date().toISOString(),
        status: 'running'
      }]
    };

    // Create initial members based on first stage
    const stageAgents = getStageAgents('team-plan');
    for (let i = 0; i < Math.min(memberCount, stageAgents.length); i++) {
      teamState.members.push({
        name: `${stageAgents[i]}-${i + 1}`,
        role: stageAgents[i],
        agentType: stageAgents[i],
        status: 'idle'
      });
    }

    // Write team state
    await writeState('team', teamState, cwd);

    // If linked to ralph, also create ralph state
    if (linkedRalph) {
      await writeState('ralph', {
        active: true,
        startedAt: new Date().toISOString(),
        taskDescription: task,
        iteration: 1,
        maxIterations: 20,
        currentPhase: 'team-execution',
        linkedTeam: true,
        teamName
      }, cwd);
    }

    return {
      content: [{
        type: 'text',
        text: `[TEAM CREATED]

Team: ${teamName}
Task: ${task}
Members: ${memberCount}
Linked to Ralph: ${linkedRalph}

Pipeline Stages:
1. team-plan: Explore and decompose task
2. team-prd: Define acceptance criteria
3. team-exec: Execute with parallel agents
4. team-verify: Verify completion
5. team-fix: Fix issues (loop if needed)

Current Stage: team-plan
Members: ${teamState.members.map(m => m.name).join(', ')}

Use team_add_task to create tasks, team_transition to move between stages.`
      }]
    };
  }
};

/**
 * Team Add Task Tool
 */
export const teamAddTaskTool: ToolDefinition = {
  name: 'team_add_task',
  description: 'Add a task to the team task list.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Task title'
      },
      description: {
        type: 'string',
        description: 'Detailed task description'
      },
      stage: {
        type: 'string',
        enum: ['team-plan', 'team-prd', 'team-exec', 'team-verify', 'team-fix'],
        description: 'Which stage this task belongs to'
      },
      assignee: {
        type: 'string',
        description: 'Team member to assign (optional)'
      }
    },
    required: ['title', 'description']
  },
  handler: async (args, context) => {
    const title = args.title as string;
    const description = args.description as string;
    const stage = (args.stage as TeamStage) || 'team-exec';
    const assignee = args.assignee as string | undefined;
    const cwd = context?.cwd || process.cwd();

    const state = await readState('team', cwd) as TeamState | null;
    if (!state || !state.active) {
      return {
        content: [{ type: 'text', text: 'No active team. Use team_create first.' }]
      };
    }

    const task: TeamTask = {
      id: generateTaskId(),
      title,
      description,
      assignee,
      status: 'pending',
      stage,
      createdAt: new Date().toISOString()
    };

    state.tasks.push(task);
    await writeState('team', state, cwd);

    return {
      content: [{
        type: 'text',
        text: `Task added: ${task.id}
Title: ${title}
Stage: ${stage}
Assignee: ${assignee || 'unassigned'}
Total tasks: ${state.tasks.length}`
      }]
    };
  }
};

/**
 * Team Assign Task Tool
 */
export const teamAssignTaskTool: ToolDefinition = {
  name: 'team_assign_task',
  description: 'Assign a task to a team member.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'Task ID to assign'
      },
      memberName: {
        type: 'string',
        description: 'Team member name to assign to'
      }
    },
    required: ['taskId', 'memberName']
  },
  handler: async (args, context) => {
    const taskId = args.taskId as string;
    const memberName = args.memberName as string;
    const cwd = context?.cwd || process.cwd();

    const state = await readState('team', cwd) as TeamState | null;
    if (!state || !state.active) {
      return {
        content: [{ type: 'text', text: 'No active team.' }]
      };
    }

    const task = state.tasks.find(t => t.id === taskId);
    if (!task) {
      return {
        content: [{ type: 'text', text: `Task not found: ${taskId}` }]
      };
    }

    const member = state.members.find(m => m.name === memberName);
    if (!member) {
      return {
        content: [{ type: 'text', text: `Member not found: ${memberName}` }]
      };
    }

    task.assignee = memberName;
    task.status = 'in_progress';
    member.status = 'working';
    member.currentTask = taskId;

    await writeState('team', state, cwd);

    return {
      content: [{
        type: 'text',
        text: `Task ${taskId} assigned to ${memberName}`
      }]
    };
  }
};

/**
 * Team Complete Task Tool
 */
export const teamCompleteTaskTool: ToolDefinition = {
  name: 'team_complete_task',
  description: 'Mark a task as completed.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'Task ID to complete'
      },
      result: {
        type: 'string',
        description: 'Result or summary of completed work'
      }
    },
    required: ['taskId']
  },
  handler: async (args, context) => {
    const taskId = args.taskId as string;
    const result = args.result as string | undefined;
    const cwd = context?.cwd || process.cwd();

    const state = await readState('team', cwd) as TeamState | null;
    if (!state || !state.active) {
      return {
        content: [{ type: 'text', text: 'No active team.' }]
      };
    }

    const task = state.tasks.find(t => t.id === taskId);
    if (!task) {
      return {
        content: [{ type: 'text', text: `Task not found: ${taskId}` }]
      };
    }

    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    task.result = result;

    // Update member status
    if (task.assignee) {
      const member = state.members.find(m => m.name === task.assignee);
      if (member) {
        member.status = 'completed';
        member.currentTask = undefined;
      }
    }

    await writeState('team', state, cwd);

    // Check if all tasks in current stage are complete
    const stageTasks = state.tasks.filter(t => t.stage === state.currentPhase);
    const completedTasks = stageTasks.filter(t => t.status === 'completed');
    const allComplete = stageTasks.length > 0 && completedTasks.length === stageTasks.length;

    return {
      content: [{
        type: 'text',
        text: `Task ${taskId} completed.
Stage progress: ${completedTasks.length}/${stageTasks.length} tasks complete
${allComplete ? '\nAll tasks in current stage complete. Ready for team_transition.' : ''}`
      }]
    };
  }
};

/**
 * Team Transition Tool
 */
export const teamTransitionTool: ToolDefinition = {
  name: 'team_transition',
  description: 'Transition team to next pipeline stage.',
  inputSchema: {
    type: 'object',
    properties: {
      nextStage: {
        type: 'string',
        enum: ['team-plan', 'team-prd', 'team-exec', 'team-verify', 'team-fix', 'complete', 'failed'],
        description: 'Next stage to transition to'
      },
      reason: {
        type: 'string',
        description: 'Reason for transition'
      }
    },
    required: ['nextStage']
  },
  handler: async (args, context) => {
    const nextStage = args.nextStage as string;
    const reason = args.reason as string || '';
    const cwd = context?.cwd || process.cwd();

    const state = await readState('team', cwd) as TeamState | null;
    if (!state || !state.active) {
      return {
        content: [{ type: 'text', text: 'No active team.' }]
      };
    }

    const previousStage = state.currentPhase;

    // Update stage history
    const currentHistory = state.stageHistory.find(h => h.stage === previousStage && h.status === 'running');
    if (currentHistory) {
      currentHistory.completedAt = new Date().toISOString();
      currentHistory.status = 'completed';
    }

    // Handle terminal states
    if (nextStage === 'complete' || nextStage === 'failed') {
      state.active = false;
      await writeState('team', state, cwd);

      // Clear linked ralph if present
      if (state.linkedRalph) {
        await clearState('ralph', cwd);
      }

      return {
        content: [{
          type: 'text',
          text: `[TEAM ${nextStage.toUpperCase()}]

Team: ${state.teamName}
Duration: ${Date.now() - new Date(state.startedAt).getTime()}ms
Stages completed: ${state.stageHistory.filter(h => h.status === 'completed').length}
Tasks completed: ${state.tasks.filter(t => t.status === 'completed').length}/${state.tasks.length}
${reason ? `Reason: ${reason}` : ''}`
        }]
      };
    }

    // Handle fix loop
    if (nextStage === 'team-fix') {
      state.fixLoopCount++;
      if (state.fixLoopCount > state.maxFixLoops) {
        state.active = false;
        await writeState('team', state, cwd);
        return {
          content: [{
            type: 'text',
            text: `[TEAM FAILED]

Max fix loops (${state.maxFixLoops}) exceeded. Team terminated.
Use team_create to start a new team.`
          }]
        };
      }
    }

    // Transition to new stage
    state.currentPhase = nextStage as TeamStage;
    state.stageHistory.push({
      stage: nextStage as TeamStage,
      startedAt: new Date().toISOString(),
      status: 'running'
    });

    // Update members based on new stage
    const stageAgents = getStageAgents(nextStage as TeamStage);
    state.members = stageAgents.slice(0, 3).map((agent, i) => ({
      name: `${agent}-${i + 1}`,
      role: agent,
      agentType: agent,
      status: 'idle' as const
    }));

    await writeState('team', state, cwd);

    return {
      content: [{
        type: 'text',
        text: `[STAGE TRANSITION]

${previousStage} -> ${nextStage}
${reason ? `Reason: ${reason}` : ''}

Available agents for ${nextStage}:
${state.members.map(m => `- ${m.name} (${m.role})`).join('\n')}

Use team_add_task to create tasks for this stage.`
      }]
    };
  }
};

/**
 * Team Status Tool
 */
export const teamStatusTool: ToolDefinition = {
  name: 'team_status',
  description: 'Get current team status including members, tasks, and pipeline progress.',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async (args, context) => {
    const cwd = context?.cwd || process.cwd();

    const state = await readState('team', cwd) as TeamState | null;
    if (!state) {
      return {
        content: [{ type: 'text', text: 'No team state found. Use team_create to start a team.' }]
      };
    }

    const memberStatus = state.members.map(m =>
      `- ${m.name} [${m.role}]: ${m.status}${m.currentTask ? ` (${m.currentTask})` : ''}`
    ).join('\n');

    const tasksByStage: Record<string, TeamTask[]> = {};
    for (const task of state.tasks) {
      if (!tasksByStage[task.stage]) tasksByStage[task.stage] = [];
      tasksByStage[task.stage].push(task);
    }

    const taskStatus = Object.entries(tasksByStage).map(([stage, tasks]) => {
      const completed = tasks.filter(t => t.status === 'completed').length;
      return `${stage}: ${completed}/${tasks.length} complete`;
    }).join('\n');

    const stageProgress = state.stageHistory.map(h =>
      `${h.status === 'running' ? '▶' : '✓'} ${h.stage}`
    ).join(' -> ');

    return {
      content: [{
        type: 'text',
        text: `## Team Status: ${state.teamName}

**Active**: ${state.active}
**Current Stage**: ${state.currentPhase}
**Linked to Ralph**: ${state.linkedRalph || false}
**Fix Loop**: ${state.fixLoopCount}/${state.maxFixLoops}

### Pipeline Progress
${stageProgress}

### Members
${memberStatus || '(no members)'}

### Tasks by Stage
${taskStatus || '(no tasks)'}

### Task Details
${state.tasks.map(t => `- [${t.status}] ${t.title} (${t.stage})`).join('\n') || '(no tasks)'}`
      }]
    };
  }
};

/**
 * Team Delete Tool
 */
export const teamDeleteTool: ToolDefinition = {
  name: 'team_delete',
  description: 'Delete a team and clean up all state.',
  inputSchema: {
    type: 'object',
    properties: {
      force: {
        type: 'boolean',
        description: 'Force delete even if tasks are pending',
        default: false
      }
    }
  },
  handler: async (args, context) => {
    const force = args.force as boolean || false;
    const cwd = context?.cwd || process.cwd();

    const state = await readState('team', cwd) as TeamState | null;
    if (!state) {
      return {
        content: [{ type: 'text', text: 'No team to delete.' }]
      };
    }

    const pendingTasks = state.tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
    if (pendingTasks.length > 0 && !force) {
      return {
        content: [{
          type: 'text',
          text: `Cannot delete team: ${pendingTasks.length} tasks still pending.
Use force=true to delete anyway.`
        }]
      };
    }

    const teamName = state.teamName;

    // Clear team state
    await clearState('team', cwd);

    // Clear linked ralph if present
    if (state.linkedRalph) {
      await clearState('ralph', cwd);
    }

    return {
      content: [{
        type: 'text',
        text: `Team "${teamName}" deleted.
${state.linkedRalph ? 'Linked ralph state also cleared.' : ''}`
      }]
    };
  }
};

/**
 * Team Send Message Tool
 */
export const teamSendMessageTool: ToolDefinition = {
  name: 'team_send_message',
  description: 'Send a message to team members (for coordination).',
  inputSchema: {
    type: 'object',
    properties: {
      recipient: {
        type: 'string',
        description: 'Member name or "all" for broadcast'
      },
      messageType: {
        type: 'string',
        enum: ['task', 'status', 'shutdown_request', 'custom'],
        description: 'Type of message'
      },
      content: {
        type: 'string',
        description: 'Message content'
      }
    },
    required: ['recipient', 'messageType', 'content']
  },
  handler: async (args, context) => {
    const recipient = args.recipient as string;
    const messageType = args.messageType as string;
    const content = args.content as string;
    const cwd = context?.cwd || process.cwd();

    const state = await readState('team', cwd) as TeamState | null;
    if (!state || !state.active) {
      return {
        content: [{ type: 'text', text: 'No active team.' }]
      };
    }

    // Log message to team communication log
    ensureTeamDir(cwd);
    const logPath = path.join(getTeamDir(cwd), 'messages.jsonl');
    const message = {
      timestamp: new Date().toISOString(),
      from: 'orchestrator',
      to: recipient,
      type: messageType,
      content
    };
    fs.appendFileSync(logPath, JSON.stringify(message) + '\n', 'utf-8');

    // Handle shutdown_request
    if (messageType === 'shutdown_request') {
      if (recipient === 'all') {
        state.members.forEach(m => m.status = 'idle');
      } else {
        const member = state.members.find(m => m.name === recipient);
        if (member) member.status = 'idle';
      }
      await writeState('team', state, cwd);
    }

    return {
      content: [{
        type: 'text',
        text: `Message sent to ${recipient}: [${messageType}] ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}`
      }]
    };
  }
};

/**
 * All team tools
 */
export const teamTools: ToolDefinition[] = [
  teamCreateTool,
  teamAddTaskTool,
  teamAssignTaskTool,
  teamCompleteTaskTool,
  teamTransitionTool,
  teamStatusTool,
  teamDeleteTool,
  teamSendMessageTool
];
