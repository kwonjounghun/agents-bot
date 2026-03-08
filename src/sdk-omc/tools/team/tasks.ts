/**
 * Team Task Tools
 *
 * Tools for managing team tasks: add, assign, and complete.
 */

import type { ToolDefinition } from '../../skills';
import { readState, writeState } from '../../state';
import type { TeamState, TeamTask, TeamStage } from './types';
import { createTaskId } from './utils';

/**
 * Team Add Task Tool
 *
 * Adds a task to the team task list.
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
    const sessionId = context?.session_id;
    const stateOptions = sessionId ? { sessionId } : undefined;

    const state = await readState('team', cwd, stateOptions) as TeamState | null;
    if (!state || !state.active) {
      return {
        content: [{ type: 'text', text: 'No active team. Use team_create first.' }]
      };
    }

    const task: TeamTask = {
      id: createTaskId(),
      title,
      description,
      assignee,
      status: 'pending',
      stage,
      createdAt: new Date().toISOString()
    };

    state.tasks.push(task);
    await writeState('team', state, cwd, stateOptions);

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
 *
 * Assigns a task to a team member.
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
    const sessionId = context?.session_id;
    const stateOptions = sessionId ? { sessionId } : undefined;

    const state = await readState('team', cwd, stateOptions) as TeamState | null;
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

    await writeState('team', state, cwd, stateOptions);

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
 *
 * Marks a task as completed.
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
    const sessionId = context?.session_id;
    const stateOptions = sessionId ? { sessionId } : undefined;

    const state = await readState('team', cwd, stateOptions) as TeamState | null;
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

    await writeState('team', state, cwd, stateOptions);

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
