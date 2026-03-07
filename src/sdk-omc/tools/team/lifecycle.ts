/**
 * Team Lifecycle Tools
 *
 * Tools for creating and deleting teams.
 */

import type { ToolDefinition } from '../../skills';
import { readState, writeState, clearState } from '../../state';
import type { TeamState, TeamStage } from './types';
import { ensureTeamDirectory, getAgentsForStage } from './utils';

/**
 * Team Create Tool
 *
 * Creates a new team for coordinated multi-agent execution.
 * Sets up team state and initializes the pipeline.
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

    ensureTeamDirectory(cwd);

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
    const stageAgents = getAgentsForStage('team-plan');
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
 * Team Delete Tool
 *
 * Deletes a team and cleans up all state.
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
