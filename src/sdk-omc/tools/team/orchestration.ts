/**
 * Team Orchestration Tools
 *
 * Tools for team coordination: transition, status, and messaging.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ToolDefinition } from '../../skills';
import { readState, writeState, clearState } from '../../state';
import type { TeamState, TeamStage, TeamTask } from './types';
import { ensureTeamDirectory, getTeamDirectory, getAgentsForStage } from './utils';

/**
 * Team Transition Tool
 *
 * Transitions team to next pipeline stage.
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
    const sessionId = context?.session_id;
    const stateOptions = sessionId ? { sessionId } : undefined;

    const state = await readState('team', cwd, stateOptions) as TeamState | null;
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
      await writeState('team', state, cwd, stateOptions);

      // Clear linked ralph if present
      if (state.linkedRalph) {
        await clearState('ralph', cwd, stateOptions);
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
        await writeState('team', state, cwd, stateOptions);
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
    const stageAgents = getAgentsForStage(nextStage as TeamStage);
    state.members = stageAgents.slice(0, 3).map((agent, i) => ({
      name: `${agent}-${i + 1}`,
      role: agent,
      agentType: agent,
      status: 'idle' as const
    }));

    await writeState('team', state, cwd, stateOptions);

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
 *
 * Gets current team status including members, tasks, and pipeline progress.
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
    const sessionId = context?.session_id;
    const stateOptions = sessionId ? { sessionId } : undefined;

    const state = await readState('team', cwd, stateOptions) as TeamState | null;
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
 * Team Send Message Tool
 *
 * Sends a message to team members for coordination.
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
    const sessionId = context?.session_id;
    const stateOptions = sessionId ? { sessionId } : undefined;

    const state = await readState('team', cwd, stateOptions) as TeamState | null;
    if (!state || !state.active) {
      return {
        content: [{ type: 'text', text: 'No active team.' }]
      };
    }

    // Log message to team communication log
    ensureTeamDirectory(cwd);
    const logPath = path.join(getTeamDirectory(cwd), 'messages.jsonl');
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
      await writeState('team', state, cwd, stateOptions);
    }

    return {
      content: [{
        type: 'text',
        text: `Message sent to ${recipient}: [${messageType}] ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}`
      }]
    };
  }
};
