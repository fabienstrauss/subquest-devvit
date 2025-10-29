/**
 * RedisManager - Handles all Redis operations for SubQuest
 * Manages game state persistence, story data storage, and configuration
 */

import { Context } from '@devvit/public-api';
import { GameState, Story, AppConfig, VoteData } from '../types/index.js';

/**
 * Redis key constants for consistent data organization
 */
const REDIS_KEYS = {
  GAME_STATE: 'subquest:gamestate',
  STORY_DATA: 'subquest:story',
  CONFIG: 'subquest:config',
  VOTE_DATA: (roundNumber: number) => `subquest:votes:round${roundNumber}`,
} as const;

/**
 * RedisManager class handles all Redis operations with proper error handling
 * and data serialization for complex objects
 */
export class RedisManager {
  private context: Context;

  constructor(context: Context) {
    this.context = context;
  }

  /**
   * Store game state data in Redis with error handling
   * @param gameState - Current game state to persist
   */
  async setGameState(gameState: GameState): Promise<void> {
    try {
      const serializedState = JSON.stringify(gameState);
      await this.context.redis.set(REDIS_KEYS.GAME_STATE, serializedState);
      console.log(`Game state saved: Round ${gameState.roundNumber}, Node ${gameState.currentNodeId}`);
    } catch (error) {
      console.error('Failed to save game state to Redis:', error);
      throw new Error(`Redis operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve game state data from Redis with deserialization
   * @returns GameState object or null if not found
   */
  async getGameState(): Promise<GameState | null> {
    try {
      const serializedState = await this.context.redis.get(REDIS_KEYS.GAME_STATE);
      
      if (!serializedState) {
        console.log('No game state found in Redis');
        return null;
      }

      const gameState = JSON.parse(serializedState) as GameState;
      console.log(`Game state loaded: Round ${gameState.roundNumber}, Node ${gameState.currentNodeId}`);
      return gameState;
    } catch (error) {
      console.error('Failed to retrieve game state from Redis:', error);
      throw new Error(`Redis operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store complete story data in Redis
   * @param story - Story object to persist
   */
  async setStoryData(story: Story): Promise<void> {
    try {
      const serializedStory = JSON.stringify(story);
      await this.context.redis.set(REDIS_KEYS.STORY_DATA, serializedStory);
      console.log(`Story data saved: "${story.title}" with ${Object.keys(story.nodes).length} nodes`);
    } catch (error) {
      console.error('Failed to save story data to Redis:', error);
      throw new Error(`Redis operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve story data from Redis
   * @returns Story object or null if not found
   */
  async getStoryData(): Promise<Story | null> {
    try {
      const serializedStory = await this.context.redis.get(REDIS_KEYS.STORY_DATA);
      
      if (!serializedStory) {
        console.log('No story data found in Redis');
        return null;
      }

      const story = JSON.parse(serializedStory) as Story;
      console.log(`Story data loaded: "${story.title}"`);
      return story;
    } catch (error) {
      console.error('Failed to retrieve story data from Redis:', error);
      throw new Error(`Redis operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store application configuration in Redis
   * @param config - Configuration object to persist
   */
  async setConfiguration(config: AppConfig): Promise<void> {
    try {
      const serializedConfig = JSON.stringify(config);
      await this.context.redis.set(REDIS_KEYS.CONFIG, serializedConfig);
      console.log(`Configuration saved: ${config.roundDurationHours}h rounds, active: ${config.isGameActive}`);
    } catch (error) {
      console.error('Failed to save configuration to Redis:', error);
      throw new Error(`Redis operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve application configuration from Redis
   * @returns AppConfig object or null if not found
   */
  async getConfiguration(): Promise<AppConfig | null> {
    try {
      const serializedConfig = await this.context.redis.get(REDIS_KEYS.CONFIG);
      
      if (!serializedConfig) {
        console.log('No configuration found in Redis');
        return null;
      }

      const config = JSON.parse(serializedConfig) as AppConfig;
      console.log(`Configuration loaded: ${config.roundDurationHours}h rounds`);
      return config;
    } catch (error) {
      console.error('Failed to retrieve configuration from Redis:', error);
      throw new Error(`Redis operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store vote tracking data for a specific round
   * @param roundNumber - Round number for vote tracking
   * @param voteData - Vote data to persist
   */
  async setVoteData(roundNumber: number, voteData: VoteData): Promise<void> {
    try {
      const serializedVoteData = JSON.stringify(voteData);
      const key = REDIS_KEYS.VOTE_DATA(roundNumber);
      await this.context.redis.set(key, serializedVoteData);
      console.log(`Vote data saved for round ${roundNumber}: ${Object.keys(voteData.choices).length} choices`);
    } catch (error) {
      console.error(`Failed to save vote data for round ${roundNumber}:`, error);
      throw new Error(`Redis operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve vote tracking data for a specific round
   * @param roundNumber - Round number to retrieve vote data for
   * @returns VoteData object or null if not found
   */
  async getVoteData(roundNumber: number): Promise<VoteData | null> {
    try {
      const key = REDIS_KEYS.VOTE_DATA(roundNumber);
      const serializedVoteData = await this.context.redis.get(key);
      
      if (!serializedVoteData) {
        console.log(`No vote data found for round ${roundNumber}`);
        return null;
      }

      const voteData = JSON.parse(serializedVoteData) as VoteData;
      console.log(`Vote data loaded for round ${roundNumber}: ${Object.keys(voteData.choices).length} choices`);
      return voteData;
    } catch (error) {
      console.error(`Failed to retrieve vote data for round ${roundNumber}:`, error);
      throw new Error(`Redis operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clear all game data (used for game reset)
   * Removes game state, vote data, but preserves story and configuration
   */
  async clearGameData(): Promise<void> {
    try {
      // Get current game state to determine how many rounds to clean up
      const gameState = await this.getGameState();
      
      // Delete game state
      await this.context.redis.del(REDIS_KEYS.GAME_STATE);
      
      // Delete vote data for all rounds if game state exists
      if (gameState) {
        for (let round = 1; round <= gameState.roundNumber; round++) {
          const voteKey = REDIS_KEYS.VOTE_DATA(round);
          await this.context.redis.del(voteKey);
        }
        console.log(`Cleared game data for ${gameState.roundNumber} rounds`);
      } else {
        console.log('No game state found, cleared basic game data');
      }
    } catch (error) {
      console.error('Failed to clear game data:', error);
      throw new Error(`Redis operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Save current story node and round number specifically
   * @param nodeId - Current story node ID
   * @param roundNumber - Current round number
   */
  async saveCurrentProgress(nodeId: string, roundNumber: number): Promise<void> {
    try {
      const gameState = await this.getGameState();
      if (!gameState) {
        throw new Error('No game state found - cannot save progress');
      }

      gameState.currentNodeId = nodeId;
      gameState.roundNumber = roundNumber;
      
      await this.setGameState(gameState);
      console.log(`Progress saved: Node ${nodeId}, Round ${roundNumber}`);
    } catch (error) {
      console.error('Failed to save current progress:', error);
      throw new Error(`Progress save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load current story node and round number
   * @returns Object with current node ID and round number, or null if no game active
   */
  async loadCurrentProgress(): Promise<{ nodeId: string; roundNumber: number } | null> {
    try {
      const gameState = await this.getGameState();
      if (!gameState || !gameState.isActive) {
        console.log('No active game found');
        return null;
      }

      return {
        nodeId: gameState.currentNodeId,
        roundNumber: gameState.roundNumber
      };
    } catch (error) {
      console.error('Failed to load current progress:', error);
      throw new Error(`Progress load failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add a node to the story path tracking
   * @param nodeId - Node ID to add to the path
   */
  async addToStoryPath(nodeId: string): Promise<void> {
    try {
      const gameState = await this.getGameState();
      if (!gameState) {
        throw new Error('No game state found - cannot update story path');
      }

      // Add node to path if it's not already the last entry (avoid duplicates)
      if (gameState.storyPath.length === 0 || gameState.storyPath[gameState.storyPath.length - 1] !== nodeId) {
        gameState.storyPath.push(nodeId);
        await this.setGameState(gameState);
        console.log(`Added node ${nodeId} to story path. Path length: ${gameState.storyPath.length}`);
      }
    } catch (error) {
      console.error('Failed to add node to story path:', error);
      throw new Error(`Story path update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the complete story path taken so far
   * @returns Array of node IDs representing the path, or empty array if no game active
   */
  async getStoryPath(): Promise<string[]> {
    try {
      const gameState = await this.getGameState();
      if (!gameState) {
        console.log('No game state found - returning empty path');
        return [];
      }

      console.log(`Story path retrieved: ${gameState.storyPath.length} nodes`);
      return [...gameState.storyPath]; // Return copy to prevent external modification
    } catch (error) {
      console.error('Failed to get story path:', error);
      throw new Error(`Story path retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update round duration configuration
   * @param durationHours - New duration in hours for each round
   */
  async updateRoundDuration(durationHours: number): Promise<void> {
    try {
      if (durationHours <= 0) {
        throw new Error('Round duration must be positive');
      }

      let config = await this.getConfiguration();
      if (!config) {
        // Create default configuration if none exists
        config = {
          roundDurationHours: durationHours,
          isGameActive: false,
          subredditName: 'unknown'
        };
      } else {
        config.roundDurationHours = durationHours;
      }

      await this.setConfiguration(config);
      
      // Also update current game state if active
      const gameState = await this.getGameState();
      if (gameState && gameState.isActive) {
        gameState.roundDurationHours = durationHours;
        await this.setGameState(gameState);
      }

      console.log(`Round duration updated to ${durationHours} hours`);
    } catch (error) {
      console.error('Failed to update round duration:', error);
      throw new Error(`Round duration update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current round duration setting
   * @returns Duration in hours, or default of 24 hours if not configured
   */
  async getRoundDuration(): Promise<number> {
    try {
      const config = await this.getConfiguration();
      const duration = config?.roundDurationHours ?? 24; // Default to 24 hours
      console.log(`Round duration retrieved: ${duration} hours`);
      return duration;
    } catch (error) {
      console.error('Failed to get round duration:', error);
      // Return default on error to prevent blocking game flow
      console.log('Using default round duration: 24 hours');
      return 24;
    }
  }

  /**
   * Initialize a new game with starting parameters
   * @param startNodeId - ID of the starting story node
   * @param subredditName - Name of the subreddit
   * @param roundDurationHours - Duration for each round
   */
  async initializeNewGame(startNodeId: string, subredditName: string, roundDurationHours: number, testMode: boolean = false): Promise<void> {
    try {
      // Clear any existing game data
      await this.clearGameData();

      // Create new game state
      const gameState: GameState = {
        currentNodeId: startNodeId,
        roundNumber: 1,
        storyPath: [startNodeId],
        isActive: true,
        roundStartTime: Date.now(),
        roundDurationHours: roundDurationHours,
        testMode: testMode
      };

      // Create/update configuration
      const config: AppConfig = {
        roundDurationHours: roundDurationHours,
        isGameActive: true,
        subredditName: subredditName
      };

      await this.setGameState(gameState);
      await this.setConfiguration(config);

      const timeUnit = testMode ? 'minute' : 'hour';
      console.log(`New game initialized: Starting at node ${startNodeId}, ${roundDurationHours}${timeUnit} rounds (Test mode: ${testMode})`);
    } catch (error) {
      console.error('Failed to initialize new game:', error);
      throw new Error(`Game initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark game as completed and inactive
   */
  async completeGame(): Promise<void> {
    try {
      const gameState = await this.getGameState();
      if (!gameState) {
        console.log('No game state found - nothing to complete');
        return;
      }

      gameState.isActive = false;
      await this.setGameState(gameState);

      // Update configuration
      const config = await this.getConfiguration();
      if (config) {
        config.isGameActive = false;
        await this.setConfiguration(config);
      }

      console.log(`Game completed at round ${gameState.roundNumber}`);
    } catch (error) {
      console.error('Failed to complete game:', error);
      throw new Error(`Game completion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check Redis connection health
   * @returns boolean indicating if Redis is accessible
   */
  async isConnected(): Promise<boolean> {
    try {
      // Test connection with a simple ping-like operation
      const testKey = 'subquest:health_check';
      const testValue = Date.now().toString();
      
      await this.context.redis.set(testKey, testValue);
      const retrieved = await this.context.redis.get(testKey);
      await this.context.redis.del(testKey);
      
      const isHealthy = retrieved === testValue;
      console.log(`Redis health check: ${isHealthy ? 'PASS' : 'FAIL'}`);
      return isHealthy;
    } catch (error) {
      console.error('Redis health check failed:', error);
      return false;
    }
  }
}