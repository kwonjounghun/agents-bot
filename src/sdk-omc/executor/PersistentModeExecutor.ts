/**
 * Persistent Mode Executor
 *
 * Implements the persistent execution loop for modes like Ralph and Autopilot.
 * This replaces the OMC plugin's Stop hook logic with SDK-native implementation.
 */

import { EventEmitter } from 'events';
import type {
  SkillMode,
  RalphState,
  AutopilotState,
  ModeState,
  PersistentModeConfig,
  ExecutionResult,
  CompletionCheckResult
} from '../types';
import {
  readState,
  writeState,
  clearState,
  createRalphState,
  createAutopilotState,
  incrementIteration,
  updatePhase,
  completeMode,
  failMode
} from '../state';
import { detectKeywordsWithType } from '../hooks';

/**
 * Query function type - injected from ClaudeAgentService
 */
export type QueryFunction = (prompt: string) => Promise<QueryResult>;

export interface QueryResult {
  success: boolean;
  response: string;
  toolsUsed: string[];
  error?: string;
}

/**
 * Completion checker function type
 */
export type CompletionChecker = (
  result: QueryResult,
  state: ModeState,
  workingDirectory: string
) => Promise<CompletionCheckResult>;

/**
 * Default configuration for persistent modes
 */
export const DEFAULT_CONFIG: PersistentModeConfig = {
  maxIterations: 20,
  checkCompletionAfterEachIteration: true,
  requireVerification: true,
  verificationModel: 'sonnet',
  continuePrompt: 'Continue working on the task. The boulder never stops. Do not stop until the task is fully complete.',
  completionPatterns: [
    /task (is )?(complete|done|finished)/i,
    /successfully (completed|implemented|fixed)/i,
    /all (tests|checks) pass/i,
    /no (more|remaining) (tasks|work|issues)/i
  ],
  failurePatterns: [
    /cannot (complete|continue|proceed)/i,
    /blocked by/i,
    /fatal error/i,
    /impossible to/i
  ]
};

/**
 * Persistent Mode Executor
 *
 * Manages the execution loop for persistent modes like Ralph and Autopilot.
 */
export class PersistentModeExecutor extends EventEmitter {
  private workingDirectory: string;
  private config: PersistentModeConfig;
  private queryFn: QueryFunction;
  private completionChecker: CompletionChecker;
  private isRunning: boolean = false;
  private shouldStop: boolean = false;

  constructor(
    workingDirectory: string,
    queryFn: QueryFunction,
    completionChecker?: CompletionChecker,
    config?: Partial<PersistentModeConfig>
  ) {
    super();
    this.workingDirectory = workingDirectory;
    this.queryFn = queryFn;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.completionChecker = completionChecker || this.defaultCompletionChecker.bind(this);
  }

  /**
   * Execute Ralph mode - persistent loop until completion
   */
  async executeRalph(task: string): Promise<ExecutionResult> {
    return this.executePersistentMode('ralph', task, {
      createState: () => createRalphState(task, this.config.maxIterations),
      phases: ['execution', 'verification', 'completed']
    });
  }

  /**
   * Execute Autopilot mode - full autonomous workflow
   */
  async executeAutopilot(goal: string): Promise<ExecutionResult> {
    return this.executePersistentMode('autopilot', goal, {
      createState: () => createAutopilotState(goal),
      phases: ['planning', 'implementing', 'testing', 'verification', 'completed']
    });
  }

  /**
   * Generic persistent mode execution
   */
  private async executePersistentMode(
    mode: SkillMode,
    task: string,
    options: {
      createState: () => ModeState;
      phases: string[];
    }
  ): Promise<ExecutionResult> {
    if (this.isRunning) {
      return {
        success: false,
        mode,
        iterations: 0,
        error: 'Another persistent mode is already running'
      };
    }

    this.isRunning = true;
    this.shouldStop = false;

    const startTime = Date.now();
    let iteration = 0;
    let lastResult: QueryResult | null = null;

    try {
      // Initialize state
      const initialState = options.createState();
      await writeState(mode, initialState, this.workingDirectory);

      this.emit('modeStarted', { mode, task, state: initialState });

      // Main execution loop
      while (!this.shouldStop && iteration < this.config.maxIterations) {
        iteration++;

        this.emit('iterationStarted', { mode, iteration, maxIterations: this.config.maxIterations });

        // Build prompt
        const prompt = iteration === 1
          ? this.buildInitialPrompt(mode, task)
          : this.buildContinuePrompt(mode, lastResult);

        // Execute query
        try {
          lastResult = await this.queryFn(prompt);
        } catch (error) {
          lastResult = {
            success: false,
            response: '',
            toolsUsed: [],
            error: error instanceof Error ? error.message : 'Query failed'
          };
        }

        this.emit('iterationCompleted', {
          mode,
          iteration,
          result: lastResult
        });

        // Update state
        await incrementIteration(mode, this.workingDirectory);

        // Check for completion
        if (this.config.checkCompletionAfterEachIteration) {
          const state = await readState(mode, this.workingDirectory);
          if (!state) break;

          const checkResult = await this.completionChecker(lastResult, state, this.workingDirectory);

          this.emit('completionChecked', { mode, iteration, checkResult });

          if (checkResult.isComplete) {
            // Optionally verify with architect
            if (this.config.requireVerification) {
              const verified = await this.runVerification(mode, task, lastResult);
              if (verified) {
                await completeMode(mode, this.workingDirectory);
                this.emit('modeCompleted', { mode, iteration, verified: true });

                return {
                  success: true,
                  mode,
                  iterations: iteration,
                  duration: Date.now() - startTime,
                  finalResponse: lastResult.response
                };
              } else {
                // Verification failed, continue
                this.emit('verificationFailed', { mode, iteration });
                continue;
              }
            } else {
              await completeMode(mode, this.workingDirectory);
              return {
                success: true,
                mode,
                iterations: iteration,
                duration: Date.now() - startTime,
                finalResponse: lastResult.response
              };
            }
          }

          if (checkResult.isBlocked) {
            await failMode(mode, checkResult.reason || 'Blocked', this.workingDirectory);
            return {
              success: false,
              mode,
              iterations: iteration,
              duration: Date.now() - startTime,
              error: checkResult.reason || 'Execution blocked'
            };
          }
        }
      }

      // Max iterations reached
      if (iteration >= this.config.maxIterations) {
        await failMode(mode, 'Max iterations reached', this.workingDirectory);
        return {
          success: false,
          mode,
          iterations: iteration,
          duration: Date.now() - startTime,
          error: 'Max iterations reached without completion'
        };
      }

      // Stopped manually
      if (this.shouldStop) {
        await updatePhase(mode, 'cancelled', this.workingDirectory);
        return {
          success: false,
          mode,
          iterations: iteration,
          duration: Date.now() - startTime,
          error: 'Execution cancelled'
        };
      }

      return {
        success: false,
        mode,
        iterations: iteration,
        duration: Date.now() - startTime,
        error: 'Unexpected exit from execution loop'
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await failMode(mode, errorMsg, this.workingDirectory);

      return {
        success: false,
        mode,
        iterations: iteration,
        duration: Date.now() - startTime,
        error: errorMsg
      };
    } finally {
      this.isRunning = false;
      this.emit('modeEnded', { mode, iterations: iteration });
    }
  }

  /**
   * Build initial prompt for the mode
   */
  private buildInitialPrompt(mode: SkillMode, task: string): string {
    const modeInstructions: Record<SkillMode, string> = {
      ralph: `You are in RALPH mode - a persistent execution loop that continues until the task is complete.

TASK: ${task}

INSTRUCTIONS:
1. Work on this task systematically
2. Use all necessary tools (Read, Write, Edit, Bash, etc.)
3. Do NOT stop until the task is fully complete
4. After each major step, assess if the task is complete
5. If complete, clearly state "TASK COMPLETE" and summarize what was done

Begin working on the task now.`,

      autopilot: `You are in AUTOPILOT mode - full autonomous execution from planning to completion.

GOAL: ${task}

PHASES:
1. PLANNING - Analyze requirements and create a plan
2. IMPLEMENTING - Execute the plan step by step
3. TESTING - Verify the implementation works
4. VERIFICATION - Final checks and cleanup

Work through each phase systematically. Do NOT stop until all phases are complete.

Begin with the PLANNING phase.`,

      team: task,
      ultrawork: task,
      ultrapilot: task,
      pipeline: task,
      plan: task
    };

    return modeInstructions[mode] || task;
  }

  /**
   * Build continuation prompt
   */
  private buildContinuePrompt(mode: SkillMode, lastResult: QueryResult | null): string {
    let prompt = this.config.continuePrompt;

    if (lastResult?.error) {
      prompt += `\n\nThe previous iteration encountered an issue: ${lastResult.error}\nPlease address this and continue.`;
    }

    return prompt;
  }

  /**
   * Default completion checker using pattern matching
   */
  private async defaultCompletionChecker(
    result: QueryResult,
    state: ModeState,
    workingDirectory: string
  ): Promise<CompletionCheckResult> {
    const response = result.response.toLowerCase();

    // Check for explicit completion signals
    for (const pattern of this.config.completionPatterns) {
      if (pattern.test(result.response)) {
        return { isComplete: true };
      }
    }

    // Check for failure/blocked signals
    for (const pattern of this.config.failurePatterns) {
      if (pattern.test(result.response)) {
        return {
          isComplete: false,
          isBlocked: true,
          reason: 'Detected failure pattern in response'
        };
      }
    }

    // Check for "TASK COMPLETE" marker
    if (response.includes('task complete') || response.includes('task is complete')) {
      return { isComplete: true };
    }

    return { isComplete: false };
  }

  /**
   * Run verification with architect agent
   */
  private async runVerification(
    mode: SkillMode,
    originalTask: string,
    lastResult: QueryResult
  ): Promise<boolean> {
    this.emit('verificationStarted', { mode });

    const verificationPrompt = `You are the ARCHITECT verifying task completion.

ORIGINAL TASK: ${originalTask}

LAST RESPONSE FROM EXECUTOR:
${lastResult.response.slice(0, 2000)}

TOOLS USED: ${lastResult.toolsUsed.join(', ') || 'None recorded'}

Please verify:
1. Was the original task fully completed?
2. Are there any remaining issues or incomplete items?
3. Is the implementation correct and complete?

If FULLY COMPLETE, respond with: "VERIFICATION: APPROVED"
If NOT COMPLETE, respond with: "VERIFICATION: REJECTED - [reason]"`;

    try {
      const verifyResult = await this.queryFn(verificationPrompt);
      const approved = verifyResult.response.includes('VERIFICATION: APPROVED');

      this.emit('verificationCompleted', { mode, approved, response: verifyResult.response });

      return approved;
    } catch (error) {
      this.emit('verificationError', { mode, error });
      // On verification error, be conservative and reject
      return false;
    }
  }

  /**
   * Stop the current execution
   */
  stop(): void {
    this.shouldStop = true;
    this.emit('stopRequested');
  }

  /**
   * Check if currently running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get current state
   */
  async getCurrentState(mode: SkillMode): Promise<ModeState | null> {
    return readState(mode, this.workingDirectory);
  }
}

/**
 * Create a persistent mode executor with default settings
 */
export function createPersistentModeExecutor(
  workingDirectory: string,
  queryFn: QueryFunction,
  config?: Partial<PersistentModeConfig>
): PersistentModeExecutor {
  return new PersistentModeExecutor(workingDirectory, queryFn, undefined, config);
}
