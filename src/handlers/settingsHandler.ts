/**
 * SettingsHandler - Manages moderator settings interface for SubQuest
 * Handles story upload, validation, game control, and configuration management
 */

import { Context, SettingsFormField } from '@devvit/public-api';
import { RedisManager } from '../utils/redisManager.js';
import { StoryEngine } from '../utils/storyEngine.js';
import { SchedulerHandler } from './schedulerHandler.js';
import { Story, GameState, AppConfig } from '../types/index.js';

/**
 * JSON Schema validation for story structure
 */
interface StoryValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  story?: Story;
}

/**
 * Detailed validation error with context
 */
interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  context?: string;
}

/**
 * SettingsHandler class manages all moderator configuration functionality
 */
export class SettingsHandler {
  private context: Context;
  private redisManager: RedisManager;
  private storyEngine: StoryEngine;

  constructor(context: Context) {
    this.context = context;
    this.redisManager = new RedisManager(context);
    this.storyEngine = new StoryEngine(context);
  }

  /**
   * Validate uploaded story JSON against expected schema
   * @param storyJson - Raw JSON string from settings form
   * @returns Validation result with errors, warnings, or parsed story
   */
  async validateStoryJson(storyJson: string): Promise<StoryValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check for empty or whitespace-only input
      if (!storyJson || !storyJson.trim()) {
        return {
          isValid: false,
          errors: ['Story JSON cannot be empty.'],
          warnings: []
        };
      }

      // Parse JSON with detailed error reporting
      let parsedStory: any;
      try {
        parsedStory = JSON.parse(storyJson);
      } catch (parseError) {
        const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parsing error';
        return {
          isValid: false,
          errors: [
            'Invalid JSON format. Please check your JSON syntax.',
            `Parse error: ${errorMessage}`,
            'Tip: Use a JSON validator to check your syntax before uploading.'
          ],
          warnings: []
        };
      }

      // Check if parsed result is an object
      if (typeof parsedStory !== 'object' || parsedStory === null || Array.isArray(parsedStory)) {
        return {
          isValid: false,
          errors: ['Story JSON must be a valid object, not an array or primitive value.'],
          warnings: []
        };
      }

      // Validate required top-level fields
      if (!parsedStory.title || typeof parsedStory.title !== 'string') {
        errors.push('Story must have a valid "title" field');
      }

      if (!parsedStory.description || typeof parsedStory.description !== 'string') {
        errors.push('Story must have a valid "description" field');
      }

      if (!parsedStory.startNodeId || typeof parsedStory.startNodeId !== 'string') {
        errors.push('Story must have a valid "startNodeId" field');
      }

      if (!parsedStory.nodes || typeof parsedStory.nodes !== 'object') {
        errors.push('Story must have a "nodes" object');
      } else {
        // Validate nodes structure
        const nodeIds = Object.keys(parsedStory.nodes);
        
        if (nodeIds.length === 0) {
          errors.push('Story must have at least one node');
        }

        // Check if startNodeId exists in nodes
        if (parsedStory.startNodeId && !parsedStory.nodes[parsedStory.startNodeId]) {
          errors.push(`Start node "${parsedStory.startNodeId}" not found in nodes`);
        }

        // Validate each node
        for (const nodeId of nodeIds) {
          const node = parsedStory.nodes[nodeId];
          const nodeErrors = this.validateStoryNode(node, nodeId, nodeIds);
          errors.push(...nodeErrors);
        }

        // Check for unreachable nodes (except start node)
        const reachableNodes = this.findReachableNodes(parsedStory);
        const unreachableNodes = nodeIds.filter(id => 
          id !== parsedStory.startNodeId && !reachableNodes.has(id)
        );
        
        if (unreachableNodes.length > 0) {
          errors.push(`Unreachable nodes found: ${unreachableNodes.join(', ')}`);
        }
      }

      // Add performance warnings for large stories
      const nodeCount = Object.keys(parsedStory.nodes).length;
      if (nodeCount > 50) {
        warnings.push(`Large story detected (${nodeCount} nodes). Consider breaking into smaller stories for better performance.`);
      }

      // Check for potential issues that aren't errors but could cause problems
      if (parsedStory.title && parsedStory.title.length > 100) {
        warnings.push('Story title is very long. Consider shortening for better display.');
      }

      if (parsedStory.description && parsedStory.description.length > 500) {
        warnings.push('Story description is very long. Consider shortening for better readability.');
      }

      if (errors.length > 0) {
        return { 
          isValid: false, 
          errors, 
          warnings 
        };
      }

      // Convert to typed Story object
      const story: Story = {
        title: parsedStory.title,
        description: parsedStory.description,
        startNodeId: parsedStory.startNodeId,
        nodes: parsedStory.nodes
      };

      return { 
        isValid: true, 
        errors: [], 
        warnings,
        story 
      };

    } catch (error) {
      console.error('Story validation error:', error);
      return {
        isValid: false,
        errors: [
          'Critical validation error occurred.',
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Please check your story format and try again.'
        ],
        warnings: []
      };
    }
  }

  /**
   * Validate individual story node structure
   * @param node - Node object to validate
   * @param nodeId - ID of the node being validated
   * @param allNodeIds - Array of all valid node IDs for reference checking
   * @returns Array of validation errors
   */
  private validateStoryNode(node: any, nodeId: string, allNodeIds: string[]): string[] {
    const errors: string[] = [];

    if (!node.id || node.id !== nodeId) {
      errors.push(`Node "${nodeId}" must have matching id field`);
    }

    if (!node.title || typeof node.title !== 'string') {
      errors.push(`Node "${nodeId}" must have a valid title`);
    }

    if (!node.content || typeof node.content !== 'string') {
      errors.push(`Node "${nodeId}" must have valid content`);
    }

    // Validate imageUrl if present
    if (node.imageUrl && typeof node.imageUrl !== 'string') {
      errors.push(`Node "${nodeId}" imageUrl must be a string`);
    }

    // Validate choices structure
    if (node.choices) {
      if (!Array.isArray(node.choices)) {
        errors.push(`Node "${nodeId}" choices must be an array`);
      } else {
        node.choices.forEach((choice: any, index: number) => {
          if (!choice.id || typeof choice.id !== 'string') {
            errors.push(`Node "${nodeId}" choice ${index} must have a valid id`);
          }

          if (!choice.text || typeof choice.text !== 'string') {
            errors.push(`Node "${nodeId}" choice ${index} must have valid text`);
          }

          if (!choice.nextNodeId || typeof choice.nextNodeId !== 'string') {
            errors.push(`Node "${nodeId}" choice ${index} must have a valid nextNodeId`);
          } else if (!allNodeIds.includes(choice.nextNodeId)) {
            errors.push(`Node "${nodeId}" choice ${index} references non-existent node "${choice.nextNodeId}"`);
          }
        });
      }
    }

    // End nodes should not have choices
    if (node.isEnd && node.choices && node.choices.length > 0) {
      errors.push(`End node "${nodeId}" should not have choices`);
    }

    // Non-end nodes should have choices
    if (!node.isEnd && (!node.choices || node.choices.length === 0)) {
      errors.push(`Non-end node "${nodeId}" must have at least one choice`);
    }

    return errors;
  }

  /**
   * Find all nodes reachable from the start node
   * @param story - Parsed story object
   * @returns Set of reachable node IDs
   */
  private findReachableNodes(story: any): Set<string> {
    const reachable = new Set<string>();
    const toVisit = [story.startNodeId];

    while (toVisit.length > 0) {
      const currentId = toVisit.pop()!;
      
      if (reachable.has(currentId)) {
        continue;
      }

      reachable.add(currentId);
      const node = story.nodes[currentId];

      if (node && node.choices) {
        for (const choice of node.choices) {
          if (!reachable.has(choice.nextNodeId)) {
            toVisit.push(choice.nextNodeId);
          }
        }
      }
    }

    return reachable;
  }

  /**
   * Handle story upload from settings form
   * @param storyJson - Raw JSON string from form
   * @returns Success status and any error/warning messages
   */
  async handleStoryUpload(storyJson: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('[SettingsHandler] Processing story upload...');

      // Validate the story JSON
      const validation = await this.validateStoryJson(storyJson);
      
      if (!validation.isValid) {
        const errorMessage = validation.errors.join('\n');
        console.error('[SettingsHandler] Story validation failed:', validation.errors);
        return { success: false, message: errorMessage };
      }

      // Store the validated story in Redis
      await this.redisManager.setStoryData(validation.story!);
      
      // Build success message with warnings if any
      let message = `Story "${validation.story!.title}" uploaded and validated successfully!`;
      
      if (validation.warnings.length > 0) {
        message += `\n\nWarnings:\n${validation.warnings.map(w => `• ${w}`).join('\n')}`;
      }

      // Add story statistics
      const nodeCount = Object.keys(validation.story!.nodes).length;
      const endNodes = Object.values(validation.story!.nodes).filter(node => node.isEnd).length;
      message += `\n\nStory Statistics:\n• ${nodeCount} total nodes\n• ${endNodes} ending(s)\n• Starting at: "${validation.story!.nodes[validation.story!.startNodeId]?.title || 'Unknown'}"`;
      
      console.log(`[SettingsHandler] Story "${validation.story!.title}" uploaded successfully`);
      return { success: true, message };

    } catch (error) {
      console.error('[SettingsHandler] Story upload error:', error);
      const errorMessage = `Failed to upload story: ${error instanceof Error ? error.message : 'Unknown error'}`;
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Initialize a new game with current settings
   * @param roundDurationHours - Duration for each round
   * @returns Success status and message
   */
  async handleStartGame(roundDurationHours: number, testMode: boolean = false, manualOnly: boolean = false): Promise<{ success: boolean; message: string }> {
    try {
      console.log('[SettingsHandler] Starting new game...');

      // Check if a story is uploaded
      const story = await this.redisManager.getStoryData();
      if (!story) {
        return { success: false, message: 'No story uploaded. Please upload a story first.' };
      }

      // Check if a game is already active
      const currentGameState = await this.redisManager.getGameState();
      if (currentGameState && currentGameState.isActive) {
        return { success: false, message: 'A game is already active. Please reset the current game first.' };
      }

      // Get subreddit name from context
      const subreddit = await this.context.reddit.getCurrentSubreddit();
      const subredditName = subreddit.name;

      // Initialize new game
      await this.redisManager.initializeNewGame(story.startNodeId, subredditName, roundDurationHours, testMode);

      // Load story into story engine
      await this.storyEngine.loadStory(JSON.stringify(story));

      // Set up automatic round advancement scheduler (unless manual-only mode)
      if (!manualOnly) {
        const schedulerHandler = new SchedulerHandler(this.context);
        const initResult = await schedulerHandler.initializeGameScheduler(subredditName, roundDurationHours);
        
        if (!initResult.success) {
          console.warn(`[SettingsHandler] Failed to initialize scheduler: ${initResult.error}`);
          // Don't fail the game start, just warn that manual advancement will be needed
        } else {
          console.log(`[SettingsHandler] Game scheduler initialized successfully`);
        }
      } else {
        console.log(`[SettingsHandler] Manual-only mode enabled - no automatic scheduler set up`);
      }

      const timeUnit = testMode ? 'minutes' : 'hours';
      console.log(`[SettingsHandler] Game started: "${story.title}" with ${roundDurationHours}${timeUnit} rounds (Test mode: ${testMode})`);
      return { 
        success: true, 
        message: `Game "${story.title}" started successfully! Round duration: ${roundDurationHours} ${timeUnit}${testMode ? ' (Test Mode)' : ''}.` 
      };

    } catch (error) {
      console.error('[SettingsHandler] Start game error:', error);
      const errorMessage = `Failed to start game: ${error instanceof Error ? error.message : 'Unknown error'}`;
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Reset current game and clear all game data
   * @returns Success status and message
   */
  async handleResetGame(): Promise<{ success: boolean; message: string }> {
    try {
      console.log('[SettingsHandler] Resetting game...');

      // Get current game state for logging
      const currentGameState = await this.redisManager.getGameState();
      
      // Clean up scheduler jobs
      const schedulerHandler = new SchedulerHandler(this.context);
      const cleanupResult = await schedulerHandler.cleanupGameScheduler();
      if (!cleanupResult.success) {
        console.warn(`[SettingsHandler] Scheduler cleanup failed: ${cleanupResult.error}`);
      }

      // Clear all game data
      await this.redisManager.clearGameData();

      // Update configuration to mark game as inactive
      const config = await this.redisManager.getConfiguration();
      if (config) {
        config.isGameActive = false;
        await this.redisManager.setConfiguration(config);
      }

      const roundInfo = currentGameState ? ` (was at round ${currentGameState.roundNumber})` : '';
      console.log(`[SettingsHandler] Game reset completed${roundInfo}`);
      
      return { 
        success: true, 
        message: `Game reset successfully${roundInfo}. You can now start a new game.` 
      };

    } catch (error) {
      console.error('[SettingsHandler] Reset game error:', error);
      const errorMessage = `Failed to reset game: ${error instanceof Error ? error.message : 'Unknown error'}`;
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Update round duration configuration
   * @param durationHours - New duration in hours
   * @returns Success status and message
   */
  async handleUpdateRoundDuration(durationHours: number): Promise<{ success: boolean; message: string }> {
    try {
      if (durationHours <= 0) {
        return { success: false, message: 'Round duration must be greater than 0 hours.' };
      }

      if (durationHours > 168) { // 1 week
        return { success: false, message: 'Round duration cannot exceed 168 hours (1 week).' };
      }

      await this.redisManager.updateRoundDuration(durationHours);

      console.log(`[SettingsHandler] Round duration updated to ${durationHours} hours`);
      return { 
        success: true, 
        message: `Round duration updated to ${durationHours} hours.` 
      };

    } catch (error) {
      console.error('[SettingsHandler] Update round duration error:', error);
      const errorMessage = `Failed to update round duration: ${error instanceof Error ? error.message : 'Unknown error'}`;
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Get current game status for display in settings
   * @returns Current game status information
   */
  async getGameStatus(): Promise<{
    hasStory: boolean;
    storyTitle?: string;
    isGameActive: boolean;
    currentRound?: number;
    roundDuration: number;
  }> {
    try {
      const story = await this.redisManager.getStoryData();
      const gameState = await this.redisManager.getGameState();
      const roundDuration = await this.redisManager.getRoundDuration();

      return {
        hasStory: !!story,
        storyTitle: story?.title,
        isGameActive: gameState?.isActive ?? false,
        currentRound: gameState?.roundNumber,
        roundDuration
      };

    } catch (error) {
      console.error('[SettingsHandler] Get game status error:', error);
      return {
        hasStory: false,
        isGameActive: false,
        roundDuration: 24
      };
    }
  }

  /**
   * Validate settings form input before processing
   * @param formData - Raw form data from settings
   * @returns Validation result with processed data or errors
   */
  async validateSettingsInput(formData: any): Promise<{
    isValid: boolean;
    errors: string[];
    processedData?: {
      storyJson?: string;
      roundDurationHours?: number;
      testMode?: boolean;
      action?: 'upload' | 'start' | 'reset' | 'updateDuration';
    };
  }> {
    const errors: string[] = [];
    const processedData: any = {};

    try {
      // Validate story JSON if provided
      if (formData.storyJson && formData.storyJson.trim()) {
        const storyValidation = await this.validateStoryJson(formData.storyJson);
        if (!storyValidation.isValid) {
          errors.push(...storyValidation.errors);
        } else {
          processedData.storyJson = formData.storyJson;
          processedData.action = 'upload';
        }
      }

      // Validate round duration and test mode
      if (formData.roundDurationHours !== undefined) {
        let duration = Number(formData.roundDurationHours);
        if (isNaN(duration) || duration <= 0) {
          errors.push('Round duration must be a positive number');
        } else if (duration > 168) {
          errors.push('Round duration cannot exceed 168 hours (1 week)');
        } else {
          // Apply test mode conversion: in test mode, use 2-minute rounds
          if (formData.testMode) {
            duration = 2; // Fixed 2-minute rounds in test mode
            console.log(`[SettingsHandler] Test mode enabled: Using ${duration} minute rounds`);
          }
          
          processedData.roundDurationHours = duration;
          processedData.testMode = !!formData.testMode;
          if (!processedData.action) {
            processedData.action = 'updateDuration';
          }
        }
      }

      // Determine action based on form data
      if (formData.startGame) {
        processedData.action = 'start';
      } else if (formData.resetGame) {
        processedData.action = 'reset';
      }

      return {
        isValid: errors.length === 0,
        errors,
        processedData: errors.length === 0 ? processedData : undefined
      };

    } catch (error) {
      console.error('[SettingsHandler] Settings validation error:', error);
      return {
        isValid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  /**
   * Initialize game state with proper configuration
   * @param story - Validated story object
   * @param roundDurationHours - Duration for each round
   * @returns Success status and details
   */
  async initializeGameState(story: Story, roundDurationHours: number): Promise<{ success: boolean; details: string }> {
    try {
      const subreddit = await this.context.reddit.getCurrentSubreddit();
      const subredditName = subreddit.name;
      
      // Create initial game state
      const gameState: GameState = {
        currentNodeId: story.startNodeId,
        roundNumber: 1,
        storyPath: [story.startNodeId],
        isActive: true,
        roundStartTime: Date.now(),
        roundDurationHours: roundDurationHours
      };

      // Create configuration
      const config: AppConfig = {
        roundDurationHours: roundDurationHours,
        isGameActive: true,
        subredditName: subredditName
      };

      // Save to Redis
      await this.redisManager.setGameState(gameState);
      await this.redisManager.setConfiguration(config);

      return {
        success: true,
        details: `Game initialized at node "${story.startNodeId}" with ${roundDurationHours}h rounds`
      };

    } catch (error) {
      console.error('[SettingsHandler] Game state initialization error:', error);
      return {
        success: false,
        details: `Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Cleanup game state and associated data
   * @returns Success status and cleanup details
   */
  async cleanupGameState(): Promise<{ success: boolean; details: string }> {
    try {
      // Get current state for logging
      const currentState = await this.redisManager.getGameState();
      const roundsCleared = currentState?.roundNumber || 0;

      // Clear all game data
      await this.redisManager.clearGameData();

      // Update configuration to inactive
      const config = await this.redisManager.getConfiguration();
      if (config) {
        config.isGameActive = false;
        await this.redisManager.setConfiguration(config);
      }

      return {
        success: true,
        details: `Cleared ${roundsCleared} rounds of game data and set game to inactive`
      };

    } catch (error) {
      console.error('[SettingsHandler] Game state cleanup error:', error);
      return {
        success: false,
        details: `Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Validate game control actions before execution
   * @param action - The action to validate ('start' or 'reset')
   * @returns Validation result with any blocking conditions
   */
  async validateGameControlAction(action: 'start' | 'reset'): Promise<{
    canProceed: boolean;
    warnings: string[];
    blockingIssues: string[];
  }> {
    const warnings: string[] = [];
    const blockingIssues: string[] = [];

    try {
      const story = await this.redisManager.getStoryData();
      const gameState = await this.redisManager.getGameState();

      if (action === 'start') {
        // Check for story
        if (!story) {
          blockingIssues.push('No story uploaded. Please upload a story first.');
        } else {
          // Validate current story
          const validation = await this.validateStoryJson(JSON.stringify(story));
          if (!validation.isValid) {
            blockingIssues.push('Current story has validation issues. Please re-upload a valid story.');
            blockingIssues.push(`Validation errors: ${validation.errors.slice(0, 3).join(', ')}${validation.errors.length > 3 ? '...' : ''}`);
          } else if (validation.warnings.length > 0) {
            warnings.push(`Story has warnings: ${validation.warnings.slice(0, 2).join(', ')}${validation.warnings.length > 2 ? '...' : ''}`);
          }
        }

        // Check for active game
        if (gameState && gameState.isActive) {
          blockingIssues.push(`A game is already active (Round ${gameState.roundNumber}). Please reset the current game first.`);
        }

        // Check Redis connectivity
        const isConnected = await this.redisManager.isConnected();
        if (!isConnected) {
          blockingIssues.push('Redis connection failed. Cannot start game without persistent storage.');
        }
      }

      if (action === 'reset') {
        // Provide detailed warnings about data loss
        if (gameState && gameState.isActive) {
          const timeElapsed = Math.round((Date.now() - gameState.roundStartTime) / (1000 * 60 * 60));
          warnings.push(`DESTRUCTIVE ACTION: This will permanently delete progress from round ${gameState.roundNumber}.`);
          warnings.push(`Game has been running for ${timeElapsed} hours.`);
          warnings.push('All community choices and story progress will be lost.');
          warnings.push('This action cannot be undone.');
        } else {
          warnings.push('No active game found, but this will clear any residual game data.');
        }

        // Check if there's vote data that would be lost
        if (gameState) {
          const voteData = await this.redisManager.getVoteData(gameState.roundNumber);
          if (voteData && Object.keys(voteData.choices).length > 0) {
            warnings.push(`Current round has ${Object.keys(voteData.choices).length} active choice(s) with community votes.`);
          }
        }
      }

      return {
        canProceed: blockingIssues.length === 0,
        warnings,
        blockingIssues
      };

    } catch (error) {
      console.error('[SettingsHandler] Game control validation error:', error);
      return {
        canProceed: false,
        warnings: [],
        blockingIssues: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  /**
   * Generate confirmation message for destructive actions
   * @param action - The destructive action being performed
   * @param context - Additional context about the current state
   * @returns Formatted confirmation message
   */
  async generateConfirmationMessage(action: 'reset', context?: any): Promise<string> {
    try {
      const gameState = await this.redisManager.getGameState();
      const story = await this.redisManager.getStoryData();

      let message = `⚠️ CONFIRMATION REQUIRED ⚠️\n\n`;

      if (action === 'reset') {
        message += `You are about to RESET the current game.\n\n`;
        
        if (gameState && gameState.isActive) {
          message += `Current Game Details:\n`;
          message += `• Story: "${story?.title || 'Unknown'}"\n`;
          message += `• Round: ${gameState.roundNumber}\n`;
          message += `• Nodes visited: ${gameState.storyPath.length}\n`;
          
          const timeElapsed = Math.round((Date.now() - gameState.roundStartTime) / (1000 * 60 * 60));
          message += `• Running for: ${timeElapsed} hours\n\n`;
          
          message += `THIS WILL PERMANENTLY DELETE:\n`;
          message += `• All story progress\n`;
          message += `• Community voting history\n`;
          message += `• Current round data\n\n`;
        } else {
          message += `No active game detected, but this will clean up any residual data.\n\n`;
        }

        message += `This action CANNOT be undone.\n\n`;
        message += `To confirm, check the "Reset Current Game" box and save settings.`;
      }

      return message;

    } catch (error) {
      console.error('[SettingsHandler] Confirmation message generation error:', error);
      return `⚠️ Unable to generate confirmation details. Proceed with caution.`;
    }
  }
}