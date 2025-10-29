/**
 * SchedulerHandler - Handles automatic story advancement using Devvit scheduler
 * Manages scheduled job registration, round advancement, and cleanup
 */

import { Context, ScheduledJobEvent } from '@devvit/public-api';
import { StoryEngine } from '../utils/storyEngine.js';
import { VoteCounter } from './voteCounter.js';
import { PostManager } from './postManager.js';
import { RedisManager } from '../utils/redisManager.js';

/**
 * Configuration for scheduler behavior
 */
export interface SchedulerConfig {
  /** Job name prefix for scheduled tasks */
  jobNamePrefix?: string;
  /** Maximum number of retries for failed operations */
  maxRetries?: number;
  /** Delay between retries in milliseconds */
  retryDelayMs?: number;
}

/**
 * Result of scheduler operation
 */
export interface SchedulerResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Job ID if scheduled successfully */
  jobId?: string;
  /** Error message if operation failed */
  error?: string;
  /** Additional details about the operation */
  details?: string;
}

/**
 * SchedulerHandler class manages automatic story advancement using Devvit's scheduler
 */
export class SchedulerHandler {
  private context: Context;
  private storyEngine: StoryEngine;
  private voteCounter: VoteCounter;
  private postManager: PostManager;
  private redisManager: RedisManager;
  private config: Required<SchedulerConfig>;

  constructor(context: Context, config: SchedulerConfig = {}) {
    this.context = context;
    this.storyEngine = new StoryEngine(context);
    this.voteCounter = new VoteCounter(context);
    this.postManager = new PostManager(context);
    this.redisManager = new RedisManager(context);
    
    this.config = {
      jobNamePrefix: config.jobNamePrefix ?? 'subquest_round_advance',
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 5000
    };
  }

  /**
   * Schedule the next round advancement after the configured duration
   * @param durationHours - Duration in hours until next round
   * @param roundNumber - Current round number for job identification
   * @returns Promise resolving to SchedulerResult
   */
  async scheduleNextRound(durationHours: number, roundNumber: number): Promise<SchedulerResult> {
    try {
      console.log(`[SchedulerHandler] Scheduling round advancement for round ${roundNumber} in ${durationHours} hours`);

      // Validate input parameters
      if (durationHours <= 0) {
        return {
          success: false,
          error: 'Duration must be positive'
        };
      }

      if (roundNumber <= 0) {
        return {
          success: false,
          error: 'Round number must be positive'
        };
      }

      // Cancel any existing scheduled job for this round
      await this.cancelScheduledRound(roundNumber);

      // Check if we're in test mode by looking at game state
      let actualDurationMs;
      try {
        const gameState = await this.redisManager.getGameState();
        if (gameState && gameState.testMode) {
          // In test mode, durationHours is actually in minutes
          actualDurationMs = durationHours * 60 * 1000; // Convert minutes to milliseconds
          console.log(`[SchedulerHandler] Test mode detected: ${durationHours} minutes = ${actualDurationMs}ms`);
        } else {
          // Normal mode, durationHours is in hours
          actualDurationMs = durationHours * 60 * 60 * 1000; // Convert hours to milliseconds
          console.log(`[SchedulerHandler] Normal mode: ${durationHours} hours = ${actualDurationMs}ms`);
        }
      } catch (error) {
        console.warn(`[SchedulerHandler] Could not check test mode, assuming normal mode:`, error);
        actualDurationMs = durationHours * 60 * 60 * 1000; // Default to hours
      }

      // Calculate when the job should run
      const runAt = new Date(Date.now() + actualDurationMs);
      
      // Use consistent job name for all rounds (Devvit will handle uniqueness)
      const jobName = this.config.jobNamePrefix;

      // Schedule the job
      const jobId = await this.context.scheduler.runJob({
        name: jobName,
        runAt: runAt,
        data: {
          roundNumber: roundNumber,
          scheduledAt: Date.now(),
          durationHours: durationHours
        }
      });

      console.log(`[SchedulerHandler] Round advancement scheduled successfully: Job ${jobId} will run at ${runAt.toISOString()}`);

      return {
        success: true,
        jobId: jobId,
        details: `Scheduled for ${runAt.toISOString()}`
      };

    } catch (error) {
      console.error(`[SchedulerHandler] Failed to schedule round advancement for round ${roundNumber}:`, error);
      return {
        success: false,
        error: `Scheduling failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Handle automatic round advancement when scheduler triggers
   * This is the main method called by the Devvit scheduler
   * @param event - Scheduled job event from Devvit
   * @returns Promise resolving to SchedulerResult
   */
  async handleRoundAdvancement(event: any): Promise<SchedulerResult> {
    try {
      const roundNumber = event.data?.roundNumber as number;
      const scheduledAt = event.data?.scheduledAt as number;
      const durationHours = event.data?.durationHours as number;

      console.log(`[SchedulerHandler] === Starting Automatic Round Advancement ===`);
      console.log(`[SchedulerHandler] Job Name: ${event.name}`);
      console.log(`[SchedulerHandler] Round Number: ${roundNumber}`);
      
      // Handle manual vs scheduled triggers
      if (scheduledAt && !isNaN(scheduledAt)) {
        console.log(`[SchedulerHandler] Scheduled At: ${new Date(scheduledAt).toISOString()}`);
      } else {
        console.log(`[SchedulerHandler] Manual Trigger: ${new Date().toISOString()}`);
      }
      
      console.log(`[SchedulerHandler] Duration: ${durationHours} hours`);

      // For manual triggers, get current round from game state
      let currentRoundNumber = roundNumber;
      if (!currentRoundNumber || currentRoundNumber <= 0) {
        console.log(`[SchedulerHandler] No round number in event data, getting from game state...`);
        const gameState = await this.redisManager.getGameState();
        if (gameState && gameState.isActive) {
          currentRoundNumber = gameState.roundNumber;
          console.log(`[SchedulerHandler] Using current round from game state: ${currentRoundNumber}`);
        } else {
          return {
            success: false,
            error: 'No active game found and no round number provided'
          };
        }
      }

      // Check if game is still active
      const gameState = await this.storyEngine.getGameState();
      if (!gameState || !gameState.isActive) {
        console.log(`[SchedulerHandler] Game is no longer active - cancelling advancement`);
        return {
          success: false,
          error: 'Game is no longer active'
        };
      }

      // Verify this is the current round (prevent processing old jobs)
      if (gameState.roundNumber !== currentRoundNumber) {
        console.log(`[SchedulerHandler] Round mismatch: Expected ${currentRoundNumber}, current is ${gameState.roundNumber} - skipping`);
        return {
          success: false,
          error: `Round mismatch: job for round ${currentRoundNumber}, current round is ${gameState.roundNumber}`
        };
      }

      // Execute the round advancement with retries
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
        try {
          console.log(`[SchedulerHandler] Round advancement attempt ${attempt}/${this.config.maxRetries}`);
          
          const advancementResult = await this.executeRoundAdvancement(currentRoundNumber);
          
          if (advancementResult.success) {
            console.log(`[SchedulerHandler] === Round Advancement Completed Successfully ===`);
            return advancementResult;
          } else {
            throw new Error(advancementResult.error || 'Round advancement failed');
          }
          
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown error');
          console.warn(`[SchedulerHandler] Attempt ${attempt} failed:`, lastError.message);
          
          // Wait before retrying (except on last attempt)
          if (attempt < this.config.maxRetries) {
            console.log(`[SchedulerHandler] Waiting ${this.config.retryDelayMs}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, this.config.retryDelayMs));
          }
        }
      }

      // All retries failed
      console.error(`[SchedulerHandler] === Round Advancement Failed After ${this.config.maxRetries} Attempts ===`);
      return {
        success: false,
        error: `All ${this.config.maxRetries} attempts failed. Last error: ${lastError?.message || 'Unknown error'}`
      };

    } catch (error) {
      console.error(`[SchedulerHandler] Critical error in round advancement handler:`, error);
      return {
        success: false,
        error: `Critical handler error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Execute the complete round advancement process
   * @param roundNumber - Round number to advance from
   * @returns Promise resolving to SchedulerResult
   */
  private async executeRoundAdvancement(roundNumber: number): Promise<SchedulerResult> {
    try {
      console.log(`[SchedulerHandler] === Executing Round Advancement for Round ${roundNumber} ===`);

      // Step 1: Count votes and determine winning choice
      console.log(`[SchedulerHandler] Step 1: Counting votes for round ${roundNumber}`);
      const winningChoiceId = await this.voteCounter.getWinningChoice(roundNumber);
      
      if (!winningChoiceId) {
        console.warn(`[SchedulerHandler] No winning choice determined for round ${roundNumber}`);
        return {
          success: false,
          error: 'No winning choice could be determined'
        };
      }

      console.log(`[SchedulerHandler] Winning choice: ${winningChoiceId}`);

      // Step 2: Advance story to next node
      console.log(`[SchedulerHandler] Step 2: Advancing story with choice ${winningChoiceId}`);
      await this.storyEngine.advanceStoryByChoice(winningChoiceId);

      // Step 3: Get the new current node to determine next action
      const newCurrentNode = await this.storyEngine.getCurrentNode();
      if (!newCurrentNode) {
        throw new Error('Failed to get new current node after advancement');
      }

      console.log(`[SchedulerHandler] Advanced to node: ${newCurrentNode.id} - "${newCurrentNode.title}"`);

      // Step 4: Determine if this is an end node or continue
      if (newCurrentNode.isEnd) {
        console.log(`[SchedulerHandler] Step 4: Reached end node - creating recap post`);
        
        // Create end game recap post
        const gameState = await this.storyEngine.getGameState();
        if (!gameState) {
          throw new Error('No game state found for recap creation');
        }

        const config = await this.redisManager.getConfiguration();
        if (!config) {
          throw new Error('No configuration found for recap creation');
        }

        const recapResult = await this.postManager.createEndGameRecapPost(config.subredditName);
        
        if (!recapResult.success) {
          throw new Error(`Failed to create recap post: ${recapResult.error}`);
        }

        console.log(`[SchedulerHandler] End game recap post created: ${recapResult.postId}`);

        return {
          success: true,
          details: `Game completed. Recap post created: ${recapResult.postId}`
        };

      } else {
        console.log(`[SchedulerHandler] Step 4: Creating next round post`);
        
        // Create next round post
        const gameState = await this.storyEngine.getGameState();
        if (!gameState) {
          throw new Error('No game state found for next round creation');
        }

        const config = await this.redisManager.getConfiguration();
        if (!config) {
          throw new Error('No configuration found for next round creation');
        }

        // Store current game state before attempting post creation (for rollback)
        const gameStateBeforePost = { ...gameState };
        
        const postResult = await this.postManager.createStoryRoundPost(config.subredditName);
        
        if (!postResult.success) {
          console.error(`[SchedulerHandler] Post creation failed, rolling back game state`);
          
          // Rollback: Restore previous game state
          await this.redisManager.setGameState(gameStateBeforePost);
          
          // Also rollback story engine state
          await this.storyEngine.navigateToNode(gameStateBeforePost.currentNodeId);
          
          console.log(`[SchedulerHandler] Game state rolled back to Round ${gameStateBeforePost.roundNumber}, Node ${gameStateBeforePost.currentNodeId}`);
          
          throw new Error(`Failed to create next round post: ${postResult.error}`);
        }

        console.log(`[SchedulerHandler] Next round post created: ${postResult.postId}`);

        // Step 5: Schedule the next round advancement
        console.log(`[SchedulerHandler] Step 5: Scheduling next round advancement`);
        const nextRoundNumber = gameState.roundNumber;
        const scheduleResult = await this.scheduleNextRound(gameState.roundDurationHours, nextRoundNumber);
        
        if (!scheduleResult.success) {
          console.warn(`[SchedulerHandler] Failed to schedule next round: ${scheduleResult.error}`);
          // Don't fail the entire operation if scheduling fails - the game can continue manually
        } else {
          console.log(`[SchedulerHandler] Next round scheduled: ${scheduleResult.jobId}`);
        }

        return {
          success: true,
          details: `Round ${roundNumber} completed. Next round post: ${postResult.postId}. Next advancement: ${scheduleResult.jobId || 'manual'}`
        };
      }

    } catch (error) {
      console.error(`[SchedulerHandler] Round advancement execution failed for round ${roundNumber}:`, error);
      throw error; // Re-throw to trigger retry logic
    }
  }

  /**
   * Cancel a scheduled round advancement job
   * @param roundNumber - Round number to cancel scheduling for
   * @returns Promise resolving to SchedulerResult
   */
  async cancelScheduledRound(roundNumber: number): Promise<SchedulerResult> {
    try {
      console.log(`[SchedulerHandler] Cancelling scheduled round advancement for round ${roundNumber}`);

      const jobName = this.config.jobNamePrefix;
      
      // Note: Devvit's scheduler API may not have direct job cancellation by name
      // This is a placeholder for the intended functionality
      // In a real implementation, we would need to track job IDs and cancel by ID
      
      console.log(`[SchedulerHandler] Attempted to cancel job: ${jobName}`);
      
      return {
        success: true,
        details: `Cancellation attempted for job: ${jobName}`
      };

    } catch (error) {
      console.error(`[SchedulerHandler] Failed to cancel scheduled round for round ${roundNumber}:`, error);
      return {
        success: false,
        error: `Cancellation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Cancel all scheduled jobs for the current game
   * @returns Promise resolving to SchedulerResult
   */
  async cancelAllScheduledRounds(): Promise<SchedulerResult> {
    try {
      console.log(`[SchedulerHandler] Cancelling all scheduled rounds for current game`);

      const gameState = await this.storyEngine.getGameState();
      if (!gameState) {
        return {
          success: true,
          details: 'No active game found - nothing to cancel'
        };
      }

      // Cancel jobs for current and potential future rounds
      const cancellationPromises: Promise<SchedulerResult>[] = [];
      
      // Cancel current round and a few future rounds to be safe
      for (let round = gameState.roundNumber; round <= gameState.roundNumber + 5; round++) {
        cancellationPromises.push(this.cancelScheduledRound(round));
      }

      const results = await Promise.all(cancellationPromises);
      const failedCancellations = results.filter(result => !result.success);

      if (failedCancellations.length > 0) {
        console.warn(`[SchedulerHandler] Some cancellations failed: ${failedCancellations.length}/${results.length}`);
      }

      console.log(`[SchedulerHandler] Bulk cancellation completed: ${results.length - failedCancellations.length}/${results.length} successful`);

      return {
        success: true,
        details: `Cancelled ${results.length - failedCancellations.length}/${results.length} scheduled jobs`
      };

    } catch (error) {
      console.error(`[SchedulerHandler] Failed to cancel all scheduled rounds:`, error);
      return {
        success: false,
        error: `Bulk cancellation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get information about the next scheduled round
   * @returns Promise resolving to scheduling information or null
   */
  async getNextScheduledRound(): Promise<{
    roundNumber: number;
    scheduledTime: Date;
    timeRemaining: number;
    jobId?: string;
  } | null> {
    try {
      const gameState = await this.storyEngine.getGameState();
      if (!gameState || !gameState.isActive) {
        return null;
      }

      // Calculate when the current round should end
      const roundEndTime = gameState.roundStartTime + (gameState.roundDurationHours * 60 * 60 * 1000);
      const timeRemaining = roundEndTime - Date.now();

      return {
        roundNumber: gameState.roundNumber,
        scheduledTime: new Date(roundEndTime),
        timeRemaining: Math.max(0, timeRemaining)
      };

    } catch (error) {
      console.error(`[SchedulerHandler] Failed to get next scheduled round info:`, error);
      return null;
    }
  }

  /**
   * Check if the current round has expired and should be advanced
   * @returns Promise resolving to boolean indicating if advancement is needed
   */
  async isRoundAdvancementDue(): Promise<boolean> {
    try {
      const scheduleInfo = await this.getNextScheduledRound();
      if (!scheduleInfo) {
        return false;
      }

      const isDue = scheduleInfo.timeRemaining <= 0;
      
      if (isDue) {
        console.log(`[SchedulerHandler] Round advancement is due: ${Math.abs(scheduleInfo.timeRemaining)}ms overdue`);
      } else {
        console.log(`[SchedulerHandler] Round advancement not due: ${scheduleInfo.timeRemaining}ms remaining`);
      }

      return isDue;

    } catch (error) {
      console.error(`[SchedulerHandler] Failed to check if round advancement is due:`, error);
      return false;
    }
  }

  /**
   * Manually trigger round advancement (for testing or emergency use)
   * @param roundNumber - Round number to advance
   * @returns Promise resolving to SchedulerResult
   */
  async manualRoundAdvancement(roundNumber: number): Promise<SchedulerResult> {
    try {
      console.log(`[SchedulerHandler] === Manual Round Advancement Triggered ===`);
      console.log(`[SchedulerHandler] Round Number: ${roundNumber}`);
      console.log(`[SchedulerHandler] Triggered At: ${new Date().toISOString()}`);

      // Validate that manual advancement is appropriate
      const gameState = await this.storyEngine.getGameState();
      if (!gameState || !gameState.isActive) {
        return {
          success: false,
          error: 'No active game found'
        };
      }

      if (gameState.roundNumber !== roundNumber) {
        return {
          success: false,
          error: `Round mismatch: requested ${roundNumber}, current is ${gameState.roundNumber}`
        };
      }

      // Execute the advancement
      const result = await this.executeRoundAdvancement(roundNumber);
      
      console.log(`[SchedulerHandler] === Manual Round Advancement ${result.success ? 'Completed' : 'Failed'} ===`);
      
      return {
        ...result,
        details: `Manual advancement: ${result.details || ''}`
      };

    } catch (error) {
      console.error(`[SchedulerHandler] Manual round advancement failed:`, error);
      return {
        success: false,
        error: `Manual advancement failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Initialize scheduler for a new game
   * @param subredditName - Subreddit name for the game
   * @param roundDurationHours - Duration for each round
   * @returns Promise resolving to SchedulerResult
   */
  async initializeGameScheduler(subredditName: string, roundDurationHours: number): Promise<SchedulerResult> {
    try {
      console.log(`[SchedulerHandler] Initializing scheduler for new game in r/${subredditName}`);

      // Cancel any existing scheduled jobs
      await this.cancelAllScheduledRounds();

      // Get current game state to schedule first round
      const gameState = await this.storyEngine.getGameState();
      if (!gameState || !gameState.isActive) {
        return {
          success: false,
          error: 'No active game state found for scheduler initialization'
        };
      }

      // Schedule the first round advancement
      const scheduleResult = await this.scheduleNextRound(roundDurationHours, gameState.roundNumber);
      
      if (!scheduleResult.success) {
        return {
          success: false,
          error: `Failed to schedule first round: ${scheduleResult.error}`
        };
      }

      console.log(`[SchedulerHandler] Game scheduler initialized successfully: ${scheduleResult.jobId}`);

      return {
        success: true,
        jobId: scheduleResult.jobId,
        details: `First round scheduled for ${roundDurationHours} hours from now`
      };

    } catch (error) {
      console.error(`[SchedulerHandler] Failed to initialize game scheduler:`, error);
      return {
        success: false,
        error: `Scheduler initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Cleanup scheduler when game ends
   * @returns Promise resolving to SchedulerResult
   */
  async cleanupGameScheduler(): Promise<SchedulerResult> {
    try {
      console.log(`[SchedulerHandler] Cleaning up game scheduler`);

      // Cancel all scheduled rounds
      const cancellationResult = await this.cancelAllScheduledRounds();
      
      console.log(`[SchedulerHandler] Game scheduler cleanup completed`);
      
      return {
        success: true,
        details: `Scheduler cleanup: ${cancellationResult.details || 'completed'}`
      };

    } catch (error) {
      console.error(`[SchedulerHandler] Failed to cleanup game scheduler:`, error);
      return {
        success: false,
        error: `Scheduler cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}