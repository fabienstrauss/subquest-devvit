/**
 * VoteCounter - Handles upvote tracking and choice resolution for SubQuest
 * Counts comment upvotes through Reddit API and determines winning choices
 */

import { Context } from '@devvit/public-api';
import { RedisManager } from '../utils/redisManager.js';
import { StoryEngine } from '../utils/storyEngine.js';
import { VoteResult, VoteData, Choice } from '../types/index.js';

/**
 * Configuration for vote counting behavior
 */
export interface VoteCounterConfig {
  /** Minimum number of votes required for a valid choice */
  minimumVotes?: number;
  /** Whether to use random tie-breaking or first choice wins */
  randomTieBreaking?: boolean;
  /** Maximum number of retries for Reddit API calls */
  maxRetries?: number;
}

/**
 * VoteCounter class handles comment upvote tracking and winning choice determination
 */
export class VoteCounter {
  private context: Context;
  private redisManager: RedisManager;
  private storyEngine: StoryEngine;
  private config: Required<VoteCounterConfig>;

  constructor(context: Context, config: VoteCounterConfig = {}) {
    this.context = context;
    this.redisManager = new RedisManager(context);
    this.storyEngine = new StoryEngine(context);
    
    this.config = {
      minimumVotes: config.minimumVotes ?? 0,
      randomTieBreaking: config.randomTieBreaking ?? true,
      maxRetries: config.maxRetries ?? 3
    };
  }

  /**
   * Track a choice comment for vote counting
   * @param choiceId - ID of the choice this comment represents
   * @param commentId - Reddit comment ID to track
   * @param roundNumber - Round number this choice belongs to
   */
  async trackChoiceComment(choiceId: string, commentId: string, roundNumber: number): Promise<void> {
    try {
      console.log(`[VoteCounter] Tracking choice comment: ${choiceId} -> ${commentId} (Round ${roundNumber})`);

      // Get existing vote data or create new
      let voteData = await this.redisManager.getVoteData(roundNumber);
      
      if (!voteData) {
        // Create new vote data structure
        const gameState = await this.redisManager.getGameState();
        if (!gameState) {
          throw new Error('No active game state found');
        }

        const roundEndTime = gameState.roundStartTime + (gameState.roundDurationHours * 60 * 60 * 1000);
        
        voteData = {
          choices: {},
          roundEndTime: roundEndTime
        };
      }

      // Add choice-comment mapping
      voteData.choices[choiceId] = commentId;
      
      // Save updated vote data
      await this.redisManager.setVoteData(roundNumber, voteData);
      
      console.log(`[VoteCounter] Choice comment tracked successfully: ${choiceId} -> ${commentId}`);
      
    } catch (error) {
      console.error(`[VoteCounter] Failed to track choice comment ${choiceId}:`, error);
      throw new Error(`Choice tracking failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Count votes for all choices in a specific round
   * @param roundNumber - Round number to count votes for
   * @returns Promise resolving to array of VoteResult objects
   */
  async countVotes(roundNumber: number): Promise<VoteResult[]> {
    try {
      console.log(`[VoteCounter] Counting votes for round ${roundNumber}`);

      // Get vote data for the round
      const voteData = await this.redisManager.getVoteData(roundNumber);
      if (!voteData) {
        console.warn(`[VoteCounter] No vote data found for round ${roundNumber}`);
        return [];
      }

      const results: VoteResult[] = [];
      
      // Count votes for each choice
      for (const [choiceId, commentId] of Object.entries(voteData.choices)) {
        try {
          const upvotes = await this.getCommentUpvotes(commentId);
          
          results.push({
            choiceId: choiceId,
            commentId: commentId,
            upvotes: upvotes
          });
          
          console.log(`[VoteCounter] Choice ${choiceId} (${commentId}): ${upvotes} upvotes`);
          
        } catch (error) {
          console.error(`[VoteCounter] Failed to count votes for choice ${choiceId} (${commentId}):`, error);
          
          // Add result with 0 votes if we can't get the count
          results.push({
            choiceId: choiceId,
            commentId: commentId,
            upvotes: 0
          });
        }
      }

      // Sort results by upvote count (descending)
      results.sort((a, b) => b.upvotes - a.upvotes);
      
      console.log(`[VoteCounter] Vote counting complete for round ${roundNumber}: ${results.length} choices counted`);
      return results;
      
    } catch (error) {
      console.error(`[VoteCounter] Failed to count votes for round ${roundNumber}:`, error);
      throw new Error(`Vote counting failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the winning choice for a specific round
   * @param roundNumber - Round number to determine winner for
   * @returns Promise resolving to winning choice ID or null if no valid winner
   */
  async getWinningChoice(roundNumber: number): Promise<string | null> {
    try {
      console.log(`[VoteCounter] Determining winning choice for round ${roundNumber}`);

      const voteResults = await this.countVotes(roundNumber);
      
      if (voteResults.length === 0) {
        console.warn(`[VoteCounter] No vote results found for round ${roundNumber}`);
        return null;
      }

      // Filter results that meet minimum vote requirement
      const validResults = voteResults.filter(result => result.upvotes >= this.config.minimumVotes);
      
      if (validResults.length === 0) {
        console.warn(`[VoteCounter] No choices meet minimum vote requirement (${this.config.minimumVotes}) for round ${roundNumber}`);
        return null;
      }

      // Get the highest vote count
      const highestVoteCount = validResults[0].upvotes;
      
      // Find all choices with the highest vote count (for tie handling)
      const topChoices = validResults.filter(result => result.upvotes === highestVoteCount);
      
      let winningChoice: string;
      
      if (topChoices.length === 1) {
        // Clear winner
        winningChoice = topChoices[0].choiceId;
        console.log(`[VoteCounter] Clear winner for round ${roundNumber}: ${winningChoice} with ${highestVoteCount} votes`);
      } else {
        // Handle tie
        winningChoice = this.resolveTie(topChoices, roundNumber);
        console.log(`[VoteCounter] Tie resolved for round ${roundNumber}: ${winningChoice} selected from ${topChoices.length} tied choices with ${highestVoteCount} votes each`);
      }

      // Log detailed results for debugging
      this.logVoteResults(roundNumber, voteResults, winningChoice);
      
      return winningChoice;
      
    } catch (error) {
      console.error(`[VoteCounter] Failed to determine winning choice for round ${roundNumber}:`, error);
      throw new Error(`Winning choice determination failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get upvote count for a specific comment
   * @param commentId - Reddit comment ID
   * @returns Promise resolving to upvote count
   */
  private async getCommentUpvotes(commentId: string): Promise<number> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        console.log(`[VoteCounter] Getting upvotes for comment ${commentId} (attempt ${attempt}/${this.config.maxRetries})`);
        
        // Get comment data from Reddit API
        const comment = await this.context.reddit.getCommentById(commentId);
        
        if (!comment) {
          throw new Error(`Comment ${commentId} not found`);
        }

        // Return the upvote count (score)
        const upvotes = comment.score || 0;
        console.log(`[VoteCounter] Comment ${commentId} has ${upvotes} upvotes`);
        return upvotes;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.warn(`[VoteCounter] Attempt ${attempt} failed for comment ${commentId}:`, lastError.message);
        
        // Wait before retrying (exponential backoff)
        if (attempt < this.config.maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s, etc.
          console.log(`[VoteCounter] Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // All retries failed
    console.error(`[VoteCounter] Failed to get upvotes for comment ${commentId} after ${this.config.maxRetries} attempts:`, lastError);
    throw new Error(`Failed to get comment upvotes: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Resolve ties between choices with equal vote counts
   * @param tiedChoices - Array of VoteResult objects with equal vote counts
   * @param roundNumber - Round number for logging
   * @returns Winning choice ID
   */
  private resolveTie(tiedChoices: VoteResult[], roundNumber: number): string {
    console.log(`[VoteCounter] Resolving tie between ${tiedChoices.length} choices for round ${roundNumber}`);
    
    if (this.config.randomTieBreaking) {
      // Random selection for tie-breaking
      const randomIndex = Math.floor(Math.random() * tiedChoices.length);
      const winner = tiedChoices[randomIndex];
      
      console.log(`[VoteCounter] Random tie-breaker selected choice ${winner.choiceId} (index ${randomIndex})`);
      return winner.choiceId;
    } else {
      // First choice wins (deterministic)
      const winner = tiedChoices[0];
      
      console.log(`[VoteCounter] First-choice tie-breaker selected choice ${winner.choiceId}`);
      return winner.choiceId;
    }
  }

  /**
   * Log detailed vote results for debugging
   * @param roundNumber - Round number
   * @param results - Array of vote results
   * @param winner - Winning choice ID
   */
  private logVoteResults(roundNumber: number, results: VoteResult[], winner: string): void {
    console.log(`[VoteCounter] === Vote Results Summary for Round ${roundNumber} ===`);
    
    results.forEach((result, index) => {
      const isWinner = result.choiceId === winner;
      const status = isWinner ? '🏆 WINNER' : `#${index + 1}`;
      
      console.log(`[VoteCounter] ${status}: Choice ${result.choiceId} - ${result.upvotes} votes (Comment: ${result.commentId})`);
    });
    
    console.log(`[VoteCounter] === End Vote Results Summary ===`);
  }

  /**
   * Get vote results for a specific round without determining a winner
   * @param roundNumber - Round number to get results for
   * @returns Promise resolving to array of VoteResult objects
   */
  async getVoteResults(roundNumber: number): Promise<VoteResult[]> {
    try {
      return await this.countVotes(roundNumber);
    } catch (error) {
      console.error(`[VoteCounter] Failed to get vote results for round ${roundNumber}:`, error);
      return [];
    }
  }

  /**
   * Check if a round has any tracked choices
   * @param roundNumber - Round number to check
   * @returns Promise resolving to boolean indicating if choices are tracked
   */
  async hasTrackedChoices(roundNumber: number): Promise<boolean> {
    try {
      const voteData = await this.redisManager.getVoteData(roundNumber);
      return voteData !== null && Object.keys(voteData.choices).length > 0;
    } catch (error) {
      console.error(`[VoteCounter] Failed to check tracked choices for round ${roundNumber}:`, error);
      return false;
    }
  }

  /**
   * Get the number of tracked choices for a round
   * @param roundNumber - Round number to check
   * @returns Promise resolving to number of tracked choices
   */
  async getTrackedChoiceCount(roundNumber: number): Promise<number> {
    try {
      const voteData = await this.redisManager.getVoteData(roundNumber);
      return voteData ? Object.keys(voteData.choices).length : 0;
    } catch (error) {
      console.error(`[VoteCounter] Failed to get tracked choice count for round ${roundNumber}:`, error);
      return 0;
    }
  }

  /**
   * Clear vote data for a specific round (used for cleanup)
   * @param roundNumber - Round number to clear data for
   */
  async clearRoundVoteData(roundNumber: number): Promise<void> {
    try {
      // Note: This would typically use a Redis delete operation
      // For now, we'll set empty vote data
      const emptyVoteData: VoteData = {
        choices: {},
        roundEndTime: 0
      };
      
      await this.redisManager.setVoteData(roundNumber, emptyVoteData);
      console.log(`[VoteCounter] Cleared vote data for round ${roundNumber}`);
      
    } catch (error) {
      console.error(`[VoteCounter] Failed to clear vote data for round ${roundNumber}:`, error);
      throw new Error(`Vote data cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get vote data expiration time for a round
   * @param roundNumber - Round number to check
   * @returns Promise resolving to expiration timestamp or null if not found
   */
  async getRoundExpiration(roundNumber: number): Promise<number | null> {
    try {
      const voteData = await this.redisManager.getVoteData(roundNumber);
      return voteData ? voteData.roundEndTime : null;
    } catch (error) {
      console.error(`[VoteCounter] Failed to get round expiration for round ${roundNumber}:`, error);
      return null;
    }
  }

  /**
   * Check if a round's voting period has expired
   * @param roundNumber - Round number to check
   * @returns Promise resolving to boolean indicating if voting has expired
   */
  async isVotingExpired(roundNumber: number): Promise<boolean> {
    try {
      const expiration = await this.getRoundExpiration(roundNumber);
      if (!expiration) {
        console.warn(`[VoteCounter] No expiration time found for round ${roundNumber}`);
        return false;
      }

      const now = Date.now();
      const isExpired = now >= expiration;
      
      console.log(`[VoteCounter] Round ${roundNumber} voting ${isExpired ? 'has expired' : 'is still active'} (${Math.round((expiration - now) / 1000)}s remaining)`);
      return isExpired;
      
    } catch (error) {
      console.error(`[VoteCounter] Failed to check voting expiration for round ${roundNumber}:`, error);
      return false;
    }
  }

  /**
   * Resolve the winning choice for a round and validate it leads to a valid story node
   * This is the main method for choice resolution that includes validation
   * @param roundNumber - Round number to resolve choice for
   * @returns Promise resolving to object with winning choice details or null if resolution failed
   */
  async resolveWinningChoice(roundNumber: number): Promise<{
    choiceId: string;
    nextNodeId: string;
    choiceText: string;
    voteCount: number;
    isValid: boolean;
  } | null> {
    try {
      console.log(`[VoteCounter] === Starting Choice Resolution for Round ${roundNumber} ===`);

      // Step 1: Get winning choice ID
      const winningChoiceId = await this.getWinningChoice(roundNumber);
      if (!winningChoiceId) {
        console.warn(`[VoteCounter] No winning choice determined for round ${roundNumber}`);
        return null;
      }

      // Step 2: Get vote results to find vote count
      const voteResults = await this.getVoteResults(roundNumber);
      const winningResult = voteResults.find(result => result.choiceId === winningChoiceId);
      if (!winningResult) {
        console.error(`[VoteCounter] Winning choice ${winningChoiceId} not found in vote results`);
        return null;
      }

      // Step 3: Get current story node to validate choice
      const currentNode = await this.storyEngine.getCurrentNode();
      if (!currentNode) {
        console.error(`[VoteCounter] No current story node found - cannot validate choice`);
        return null;
      }

      // Step 4: Find the choice in current node's choices
      const choice = currentNode.choices?.find(c => c.id === winningChoiceId);
      if (!choice) {
        console.error(`[VoteCounter] Choice ${winningChoiceId} not found in current node ${currentNode.id} choices`);
        return null;
      }

      // Step 5: Validate that the next node exists
      const nextNode = await this.storyEngine.getNodeById(choice.nextNodeId);
      const isValid = nextNode !== null;

      if (!isValid) {
        console.error(`[VoteCounter] Choice ${winningChoiceId} leads to invalid node ${choice.nextNodeId}`);
      }

      // Step 6: Log choice selection details
      this.logChoiceSelection(roundNumber, {
        choiceId: winningChoiceId,
        nextNodeId: choice.nextNodeId,
        choiceText: choice.text,
        voteCount: winningResult.upvotes,
        isValid: isValid,
        currentNodeId: currentNode.id,
        nextNodeTitle: nextNode?.title || 'INVALID NODE'
      });

      const result = {
        choiceId: winningChoiceId,
        nextNodeId: choice.nextNodeId,
        choiceText: choice.text,
        voteCount: winningResult.upvotes,
        isValid: isValid
      };

      console.log(`[VoteCounter] === Choice Resolution Complete for Round ${roundNumber} ===`);
      return result;

    } catch (error) {
      console.error(`[VoteCounter] Failed to resolve winning choice for round ${roundNumber}:`, error);
      return null;
    }
  }

  /**
   * Execute the winning choice by advancing the story
   * This method handles the complete choice execution process
   * @param roundNumber - Round number to execute choice for
   * @returns Promise resolving to boolean indicating success
   */
  async executeWinningChoice(roundNumber: number): Promise<boolean> {
    try {
      console.log(`[VoteCounter] === Executing Winning Choice for Round ${roundNumber} ===`);

      // Step 1: Resolve the winning choice with validation
      const choiceResolution = await this.resolveWinningChoice(roundNumber);
      if (!choiceResolution) {
        console.error(`[VoteCounter] Failed to resolve winning choice for round ${roundNumber}`);
        return false;
      }

      if (!choiceResolution.isValid) {
        console.error(`[VoteCounter] Cannot execute invalid choice ${choiceResolution.choiceId} for round ${roundNumber}`);
        return false;
      }

      // Step 2: Advance the story using the StoryEngine
      try {
        await this.storyEngine.advanceStoryByChoice(choiceResolution.choiceId);
        console.log(`[VoteCounter] Story advanced successfully: ${choiceResolution.choiceText} -> ${choiceResolution.nextNodeId}`);
      } catch (storyError) {
        console.error(`[VoteCounter] Failed to advance story with choice ${choiceResolution.choiceId}:`, storyError);
        return false;
      }

      // Step 3: Log successful execution
      this.logChoiceExecution(roundNumber, choiceResolution, true);

      console.log(`[VoteCounter] === Choice Execution Complete for Round ${roundNumber} ===`);
      return true;

    } catch (error) {
      console.error(`[VoteCounter] Failed to execute winning choice for round ${roundNumber}:`, error);
      
      // Log failed execution
      this.logChoiceExecution(roundNumber, null, false, error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  /**
   * Get all available choices for the current round with their vote counts
   * @param roundNumber - Round number to get choices for
   * @returns Promise resolving to array of choice details with vote counts
   */
  async getChoicesWithVotes(roundNumber: number): Promise<Array<{
    choiceId: string;
    choiceText: string;
    nextNodeId: string;
    voteCount: number;
    commentId: string;
  }>> {
    try {
      console.log(`[VoteCounter] Getting choices with votes for round ${roundNumber}`);

      // Get current node choices
      const currentNode = await this.storyEngine.getCurrentNode();
      if (!currentNode || !currentNode.choices) {
        console.warn(`[VoteCounter] No choices available for current node`);
        return [];
      }

      // Get vote results
      const voteResults = await this.getVoteResults(roundNumber);

      // Combine choice data with vote counts
      const choicesWithVotes = currentNode.choices.map(choice => {
        const voteResult = voteResults.find(result => result.choiceId === choice.id);
        
        return {
          choiceId: choice.id,
          choiceText: choice.text,
          nextNodeId: choice.nextNodeId,
          voteCount: voteResult?.upvotes || 0,
          commentId: voteResult?.commentId || 'unknown'
        };
      });

      // Sort by vote count (descending)
      choicesWithVotes.sort((a, b) => b.voteCount - a.voteCount);

      console.log(`[VoteCounter] Retrieved ${choicesWithVotes.length} choices with votes for round ${roundNumber}`);
      return choicesWithVotes;

    } catch (error) {
      console.error(`[VoteCounter] Failed to get choices with votes for round ${roundNumber}:`, error);
      return [];
    }
  }

  /**
   * Validate that a choice ID exists in the current story node
   * @param choiceId - Choice ID to validate
   * @returns Promise resolving to boolean indicating if choice is valid
   */
  async validateChoice(choiceId: string): Promise<boolean> {
    try {
      const currentNode = await this.storyEngine.getCurrentNode();
      if (!currentNode || !currentNode.choices) {
        return false;
      }

      const choice = currentNode.choices.find(c => c.id === choiceId);
      if (!choice) {
        return false;
      }

      // Also validate that the next node exists
      const nextNode = await this.storyEngine.getNodeById(choice.nextNodeId);
      return nextNode !== null;

    } catch (error) {
      console.error(`[VoteCounter] Failed to validate choice ${choiceId}:`, error);
      return false;
    }
  }

  /**
   * Log detailed choice selection information for debugging
   * @param roundNumber - Round number
   * @param details - Choice selection details
   */
  private logChoiceSelection(roundNumber: number, details: {
    choiceId: string;
    nextNodeId: string;
    choiceText: string;
    voteCount: number;
    isValid: boolean;
    currentNodeId: string;
    nextNodeTitle: string;
  }): void {
    console.log(`[VoteCounter] === Choice Selection Details for Round ${roundNumber} ===`);
    console.log(`[VoteCounter] Current Node: ${details.currentNodeId}`);
    console.log(`[VoteCounter] Winning Choice: ${details.choiceId}`);
    console.log(`[VoteCounter] Choice Text: "${details.choiceText}"`);
    console.log(`[VoteCounter] Vote Count: ${details.voteCount}`);
    console.log(`[VoteCounter] Next Node: ${details.nextNodeId} - "${details.nextNodeTitle}"`);
    console.log(`[VoteCounter] Valid Choice: ${details.isValid ? '✅ YES' : '❌ NO'}`);
    console.log(`[VoteCounter] === End Choice Selection Details ===`);
  }

  /**
   * Log choice execution results for debugging
   * @param roundNumber - Round number
   * @param choiceResolution - Choice resolution details (null if failed)
   * @param success - Whether execution was successful
   * @param errorMessage - Error message if execution failed
   */
  private logChoiceExecution(
    roundNumber: number,
    choiceResolution: { choiceId: string; nextNodeId: string; choiceText: string; voteCount: number } | null,
    success: boolean,
    errorMessage?: string
  ): void {
    console.log(`[VoteCounter] === Choice Execution Log for Round ${roundNumber} ===`);
    
    if (success && choiceResolution) {
      console.log(`[VoteCounter] ✅ EXECUTION SUCCESSFUL`);
      console.log(`[VoteCounter] Executed Choice: ${choiceResolution.choiceId} - "${choiceResolution.choiceText}"`);
      console.log(`[VoteCounter] Advanced to Node: ${choiceResolution.nextNodeId}`);
      console.log(`[VoteCounter] Final Vote Count: ${choiceResolution.voteCount}`);
    } else {
      console.log(`[VoteCounter] ❌ EXECUTION FAILED`);
      if (errorMessage) {
        console.log(`[VoteCounter] Error: ${errorMessage}`);
      }
      if (choiceResolution) {
        console.log(`[VoteCounter] Failed Choice: ${choiceResolution.choiceId} - "${choiceResolution.choiceText}"`);
      }
    }
    
    console.log(`[VoteCounter] === End Choice Execution Log ===`);
  }
}