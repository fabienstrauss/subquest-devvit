/**
 * StoryEngine - Core story management and navigation for SubQuest
 * Handles story loading, validation, node traversal, and game state management
 */

import { Context } from '@devvit/public-api';
import { StoryNode, Choice, GameState, Story } from '../types/index.js';
import { RedisManager } from './redisManager.js';

/**
 * StoryEngine class manages all story-related operations including
 * JSON validation, node navigation, and game state management
 */
export class StoryEngine {
  private context: Context;
  private redisManager: RedisManager;
  private currentStory: Story | null = null;

  constructor(context: Context) {
    this.context = context;
    this.redisManager = new RedisManager(context);
  }

  /**
   * Load and validate a story from JSON string
   * Performs comprehensive validation of story structure and relationships
   * @param storyJson - JSON string containing the story data
   */
  async loadStory(storyJson: string): Promise<void> {
    try {
      console.log('Loading story from JSON...');
      
      // Parse JSON with error handling
      let parsedStory: any;
      try {
        parsedStory = JSON.parse(storyJson);
      } catch (parseError) {
        throw new Error(`Invalid JSON format: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`);
      }

      // Validate story structure
      this.validateStoryStructure(parsedStory);
      
      // Cast to Story type after validation
      const story = parsedStory as Story;
      
      // Validate story relationships and references
      this.validateStoryReferences(story);
      
      // Store validated story in Redis and memory
      await this.redisManager.setStoryData(story);
      this.currentStory = story;
      
      console.log(`Story "${story.title}" loaded successfully with ${Object.keys(story.nodes).length} nodes`);
    } catch (error) {
      console.error('Failed to load story:', error);
      throw new Error(`Story loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the current story node based on game state
   * @returns Current StoryNode or null if no active game
   */
  async getCurrentNode(): Promise<StoryNode | null> {
    try {
      // Load story if not in memory
      if (!this.currentStory) {
        this.currentStory = await this.redisManager.getStoryData();
        if (!this.currentStory) {
          console.log('No story data found');
          return null;
        }
      }

      // Get current game state
      const gameState = await this.redisManager.getGameState();
      if (!gameState || !gameState.isActive) {
        console.log('No active game found');
        return null;
      }

      // Find and return current node
      const currentNode = this.currentStory.nodes[gameState.currentNodeId];
      if (!currentNode) {
        throw new Error(`Current node ${gameState.currentNodeId} not found in story`);
      }

      console.log(`Current node retrieved: ${currentNode.id} - "${currentNode.title}"`);
      return currentNode;
    } catch (error) {
      console.error('Failed to get current node:', error);
      throw new Error(`Current node retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get available choices for the current story node
   * @returns Array of Choice objects or empty array if no choices available
   */
  async getAvailableChoices(): Promise<Choice[]> {
    try {
      const currentNode = await this.getCurrentNode();
      if (!currentNode) {
        console.log('No current node - no choices available');
        return [];
      }

      const choices = currentNode.choices || [];
      console.log(`Retrieved ${choices.length} choices for node ${currentNode.id}`);
      return choices;
    } catch (error) {
      console.error('Failed to get available choices:', error);
      throw new Error(`Choice retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Navigate to a specific story node by ID
   * @param nodeId - ID of the target story node
   */
  async navigateToNode(nodeId: string): Promise<void> {
    try {
      // Load story if not in memory
      if (!this.currentStory) {
        this.currentStory = await this.redisManager.getStoryData();
        if (!this.currentStory) {
          throw new Error('No story data found - cannot navigate');
        }
      }

      // Validate target node exists
      const targetNode = this.currentStory.nodes[nodeId];
      if (!targetNode) {
        throw new Error(`Target node ${nodeId} not found in story`);
      }

      // Get current game state
      const gameState = await this.redisManager.getGameState();
      if (!gameState) {
        throw new Error('No game state found - cannot navigate');
      }

      // Update game state with new node
      gameState.currentNodeId = nodeId;
      
      // Add to story path if not already present
      if (gameState.storyPath.length === 0 || gameState.storyPath[gameState.storyPath.length - 1] !== nodeId) {
        gameState.storyPath.push(nodeId);
      }

      await this.redisManager.setGameState(gameState);
      console.log(`Navigated to node: ${nodeId} - "${targetNode.title}"`);
    } catch (error) {
      console.error('Failed to navigate to node:', error);
      throw new Error(`Navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if the current node is an end node
   * @returns boolean indicating if current node ends the story
   */
  async isCurrentNodeEnd(): Promise<boolean> {
    try {
      const currentNode = await this.getCurrentNode();
      if (!currentNode) {
        return false;
      }

      const isEnd = currentNode.isEnd === true;
      console.log(`Current node ${currentNode.id} is end node: ${isEnd}`);
      return isEnd;
    } catch (error) {
      console.error('Failed to check if current node is end:', error);
      return false;
    }
  }

  /**
   * Get a specific story node by ID
   * @param nodeId - ID of the story node to retrieve
   * @returns StoryNode or null if not found
   */
  async getNodeById(nodeId: string): Promise<StoryNode | null> {
    try {
      // Load story if not in memory
      if (!this.currentStory) {
        this.currentStory = await this.redisManager.getStoryData();
        if (!this.currentStory) {
          console.log('No story data found');
          return null;
        }
      }

      const node = this.currentStory.nodes[nodeId];
      if (!node) {
        console.log(`Node ${nodeId} not found in story`);
        return null;
      }

      console.log(`Node retrieved: ${node.id} - "${node.title}"`);
      return node;
    } catch (error) {
      console.error('Failed to get node by ID:', error);
      throw new Error(`Node retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the loaded story metadata
   * @returns Story metadata or null if no story loaded
   */
  async getStoryMetadata(): Promise<{ title: string; description: string; startNodeId: string } | null> {
    try {
      // Load story if not in memory
      if (!this.currentStory) {
        this.currentStory = await this.redisManager.getStoryData();
        if (!this.currentStory) {
          console.log('No story data found');
          return null;
        }
      }

      const metadata = {
        title: this.currentStory.title,
        description: this.currentStory.description,
        startNodeId: this.currentStory.startNodeId
      };

      console.log(`Story metadata retrieved: "${metadata.title}"`);
      return metadata;
    } catch (error) {
      console.error('Failed to get story metadata:', error);
      throw new Error(`Story metadata retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate the basic structure of a story object
   * @param story - Parsed story object to validate
   */
  private validateStoryStructure(story: any): void {
    // Check required top-level fields
    if (!story || typeof story !== 'object') {
      throw new Error('Story must be a valid object');
    }

    if (!story.title || typeof story.title !== 'string') {
      throw new Error('Story must have a valid title string');
    }

    if (!story.description || typeof story.description !== 'string') {
      throw new Error('Story must have a valid description string');
    }

    if (!story.startNodeId || typeof story.startNodeId !== 'string') {
      throw new Error('Story must have a valid startNodeId string');
    }

    if (!story.nodes || typeof story.nodes !== 'object') {
      throw new Error('Story must have a nodes object');
    }

    // Validate each story node
    const nodeIds = Object.keys(story.nodes);
    if (nodeIds.length === 0) {
      throw new Error('Story must contain at least one node');
    }

    for (const nodeId of nodeIds) {
      this.validateStoryNode(story.nodes[nodeId], nodeId);
    }

    console.log(`Story structure validation passed: ${nodeIds.length} nodes validated`);
  }

  /**
   * Validate a single story node structure
   * @param node - Story node to validate
   * @param nodeId - Expected node ID for validation
   */
  private validateStoryNode(node: any, nodeId: string): void {
    if (!node || typeof node !== 'object') {
      throw new Error(`Node ${nodeId} must be a valid object`);
    }

    if (node.id !== nodeId) {
      throw new Error(`Node ${nodeId} has mismatched ID: ${node.id}`);
    }

    if (!node.title || typeof node.title !== 'string') {
      throw new Error(`Node ${nodeId} must have a valid title string`);
    }

    if (!node.content || typeof node.content !== 'string') {
      throw new Error(`Node ${nodeId} must have a valid content string`);
    }

    // Validate optional imageUrl
    if (node.imageUrl !== undefined && typeof node.imageUrl !== 'string') {
      throw new Error(`Node ${nodeId} imageUrl must be a string if provided`);
    }

    // Validate optional isEnd
    if (node.isEnd !== undefined && typeof node.isEnd !== 'boolean') {
      throw new Error(`Node ${nodeId} isEnd must be a boolean if provided`);
    }

    // Validate choices array if present
    if (node.choices !== undefined) {
      if (!Array.isArray(node.choices)) {
        throw new Error(`Node ${nodeId} choices must be an array if provided`);
      }

      for (let i = 0; i < node.choices.length; i++) {
        this.validateChoice(node.choices[i], nodeId, i);
      }
    }

    // End nodes should not have choices
    if (node.isEnd === true && node.choices && node.choices.length > 0) {
      throw new Error(`Node ${nodeId} is marked as end but has choices`);
    }

    // Non-end nodes should have choices (unless explicitly marked as end)
    if (node.isEnd !== true && (!node.choices || node.choices.length === 0)) {
      throw new Error(`Node ${nodeId} is not marked as end but has no choices`);
    }
  }

  /**
   * Validate a single choice structure
   * @param choice - Choice object to validate
   * @param nodeId - Parent node ID for error context
   * @param choiceIndex - Choice index for error context
   */
  private validateChoice(choice: any, nodeId: string, choiceIndex: number): void {
    if (!choice || typeof choice !== 'object') {
      throw new Error(`Node ${nodeId} choice ${choiceIndex} must be a valid object`);
    }

    if (!choice.id || typeof choice.id !== 'string') {
      throw new Error(`Node ${nodeId} choice ${choiceIndex} must have a valid id string`);
    }

    if (!choice.text || typeof choice.text !== 'string') {
      throw new Error(`Node ${nodeId} choice ${choiceIndex} must have a valid text string`);
    }

    if (!choice.nextNodeId || typeof choice.nextNodeId !== 'string') {
      throw new Error(`Node ${nodeId} choice ${choiceIndex} must have a valid nextNodeId string`);
    }
  }

  /**
   * Initialize a new game with the loaded story
   * @param subredditName - Name of the subreddit where the game is running
   * @param roundDurationHours - Duration in hours for each round
   */
  async initializeGame(subredditName: string, roundDurationHours: number, testMode: boolean = false): Promise<void> {
    try {
      // Ensure story is loaded
      if (!this.currentStory) {
        this.currentStory = await this.redisManager.getStoryData();
        if (!this.currentStory) {
          throw new Error('No story data found - cannot initialize game');
        }
      }

      // Validate round duration
      if (roundDurationHours <= 0) {
        throw new Error('Round duration must be positive');
      }

      // Initialize new game using RedisManager
      await this.redisManager.initializeNewGame(
        this.currentStory.startNodeId,
        subredditName,
        roundDurationHours,
        testMode
      );

      console.log(`Game initialized: "${this.currentStory.title}" starting at node ${this.currentStory.startNodeId}`);
    } catch (error) {
      console.error('Failed to initialize game:', error);
      throw new Error(`Game initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Reset the current game to initial state
   * Clears all game progress but preserves story and configuration
   */
  async resetGame(): Promise<void> {
    try {
      // Ensure story is loaded
      if (!this.currentStory) {
        this.currentStory = await this.redisManager.getStoryData();
        if (!this.currentStory) {
          throw new Error('No story data found - cannot reset game');
        }
      }

      // Get current configuration for reset
      const config = await this.redisManager.getConfiguration();
      if (!config) {
        throw new Error('No configuration found - cannot reset game');
      }

      // Clear game data and reinitialize
      await this.redisManager.clearGameData();
      await this.redisManager.initializeNewGame(
        this.currentStory.startNodeId,
        config.subredditName,
        config.roundDurationHours
      );

      console.log(`Game reset: Returned to start node ${this.currentStory.startNodeId}`);
    } catch (error) {
      console.error('Failed to reset game:', error);
      throw new Error(`Game reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Advance the story to the next node based on choice selection
   * @param choiceId - ID of the selected choice
   */
  async advanceStoryByChoice(choiceId: string): Promise<void> {
    try {
      // Get current node and validate choice
      const currentNode = await this.getCurrentNode();
      if (!currentNode) {
        throw new Error('No current node found - cannot advance story');
      }

      if (!currentNode.choices || currentNode.choices.length === 0) {
        throw new Error(`Current node ${currentNode.id} has no choices available`);
      }

      // Find the selected choice
      const selectedChoice = currentNode.choices.find(choice => choice.id === choiceId);
      if (!selectedChoice) {
        throw new Error(`Choice ${choiceId} not found in current node ${currentNode.id}`);
      }

      // Get current game state to increment round
      const gameState = await this.redisManager.getGameState();
      if (!gameState) {
        throw new Error('No game state found - cannot advance story');
      }

      // Update game state with new node and incremented round
      gameState.currentNodeId = selectedChoice.nextNodeId;
      gameState.roundNumber += 1;
      gameState.roundStartTime = Date.now();
      
      // Add to story path if not already present
      if (gameState.storyPath.length === 0 || gameState.storyPath[gameState.storyPath.length - 1] !== selectedChoice.nextNodeId) {
        gameState.storyPath.push(selectedChoice.nextNodeId);
      }
      
      // Save updated game state atomically
      await this.redisManager.setGameState(gameState);

      console.log(`Story advanced: Choice "${selectedChoice.text}" -> Node ${selectedChoice.nextNodeId}, Round ${gameState.roundNumber}`);
    } catch (error) {
      console.error('Failed to advance story by choice:', error);
      throw new Error(`Story advancement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the current game state
   * @returns GameState object or null if no active game
   */
  async getGameState(): Promise<GameState | null> {
    try {
      const gameState = await this.redisManager.getGameState();
      if (!gameState) {
        console.log('No game state found');
        return null;
      }

      console.log(`Game state retrieved: Round ${gameState.roundNumber}, Node ${gameState.currentNodeId}, Active: ${gameState.isActive}`);
      return gameState;
    } catch (error) {
      console.error('Failed to get game state:', error);
      throw new Error(`Game state retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the complete story path taken so far
   * @returns Array of node IDs representing the path taken
   */
  async getStoryPath(): Promise<string[]> {
    try {
      const storyPath = await this.redisManager.getStoryPath();
      console.log(`Story path retrieved: ${storyPath.length} nodes`);
      return storyPath;
    } catch (error) {
      console.error('Failed to get story path:', error);
      throw new Error(`Story path retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get story path with node details for recap generation
   * @returns Array of objects containing node ID, title, and choice made
   */
  async getStoryPathWithDetails(): Promise<Array<{ nodeId: string; title: string; choiceMade?: string }>> {
    try {
      // Load story if not in memory
      if (!this.currentStory) {
        this.currentStory = await this.redisManager.getStoryData();
        if (!this.currentStory) {
          throw new Error('No story data found');
        }
      }

      const storyPath = await this.getStoryPath();
      const pathDetails: Array<{ nodeId: string; title: string; choiceMade?: string }> = [];

      for (let i = 0; i < storyPath.length; i++) {
        const nodeId = storyPath[i];
        const node = this.currentStory.nodes[nodeId];
        
        if (!node) {
          console.warn(`Node ${nodeId} not found in story - skipping`);
          continue;
        }

        const detail: { nodeId: string; title: string; choiceMade?: string } = {
          nodeId: nodeId,
          title: node.title
        };

        // If there's a next node, find which choice was made
        if (i < storyPath.length - 1) {
          const nextNodeId = storyPath[i + 1];
          const choiceMade = node.choices?.find(choice => choice.nextNodeId === nextNodeId);
          if (choiceMade) {
            detail.choiceMade = choiceMade.text;
          }
        }

        pathDetails.push(detail);
      }

      console.log(`Story path with details retrieved: ${pathDetails.length} nodes`);
      return pathDetails;
    } catch (error) {
      console.error('Failed to get story path with details:', error);
      throw new Error(`Story path details retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if the game has reached an end state
   * @returns boolean indicating if the game is complete
   */
  async isGameComplete(): Promise<boolean> {
    try {
      const isEnd = await this.isCurrentNodeEnd();
      const gameState = await this.getGameState();
      
      const isComplete = isEnd && gameState?.isActive === true;
      console.log(`Game completion check: End node: ${isEnd}, Active: ${gameState?.isActive}, Complete: ${isComplete}`);
      return isComplete;
    } catch (error) {
      console.error('Failed to check game completion:', error);
      return false;
    }
  }

  /**
   * Mark the game as completed
   * Updates game state to inactive and preserves final state
   */
  async completeGame(): Promise<void> {
    try {
      await this.redisManager.completeGame();
      console.log('Game marked as completed');
    } catch (error) {
      console.error('Failed to complete game:', error);
      throw new Error(`Game completion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the current round number
   * @returns Current round number or 0 if no active game
   */
  async getCurrentRound(): Promise<number> {
    try {
      const gameState = await this.getGameState();
      const roundNumber = gameState?.roundNumber || 0;
      console.log(`Current round retrieved: ${roundNumber}`);
      return roundNumber;
    } catch (error) {
      console.error('Failed to get current round:', error);
      return 0;
    }
  }

  /**
   * Check if a game is currently active
   * @returns boolean indicating if a game is active
   */
  async isGameActive(): Promise<boolean> {
    try {
      const gameState = await this.getGameState();
      const isActive = gameState?.isActive === true;
      console.log(`Game active check: ${isActive}`);
      return isActive;
    } catch (error) {
      console.error('Failed to check if game is active:', error);
      return false;
    }
  }

  /**
   * Get time remaining in current round
   * @returns Time remaining in milliseconds, or 0 if no active game
   */
  async getTimeRemainingInRound(): Promise<number> {
    try {
      const gameState = await this.getGameState();
      if (!gameState || !gameState.isActive) {
        return 0;
      }

      // Calculate duration in milliseconds based on test mode
      const roundDurationMs = gameState.testMode 
        ? gameState.roundDurationHours * 60 * 1000  // Test mode: duration is in minutes
        : gameState.roundDurationHours * 60 * 60 * 1000;  // Normal mode: duration is in hours
      
      const elapsedMs = Date.now() - gameState.roundStartTime;
      const remainingMs = Math.max(0, roundDurationMs - elapsedMs);

      const timeUnit = gameState.testMode ? 'minutes' : 'hours';
      const timeValue = gameState.testMode 
        ? Math.round(remainingMs / 1000 / 60)  // Show minutes in test mode
        : Math.round(remainingMs / 1000 / 60 / 60);  // Show hours in normal mode
      
      console.log(`Time remaining in round: ${timeValue} ${timeUnit} (Test mode: ${!!gameState.testMode})`);
      return remainingMs;
    } catch (error) {
      console.error('Failed to get time remaining in round:', error);
      return 0;
    }
  }

  /**
   * Check if the current round has expired
   * @returns boolean indicating if the round time has elapsed
   */
  async isRoundExpired(): Promise<boolean> {
    try {
      const timeRemaining = await this.getTimeRemainingInRound();
      const isExpired = timeRemaining <= 0;
      console.log(`Round expiration check: ${isExpired}`);
      return isExpired;
    } catch (error) {
      console.error('Failed to check round expiration:', error);
      return false;
    }
  }

  /**
   * Validate story node references and relationships
   * @param story - Complete story object to validate
   */
  private validateStoryReferences(story: Story): void {
    const nodeIds = Object.keys(story.nodes);
    
    // Validate start node exists
    if (!story.nodes[story.startNodeId]) {
      throw new Error(`Start node ${story.startNodeId} not found in story nodes`);
    }

    // Validate all choice references point to existing nodes
    for (const nodeId of nodeIds) {
      const node = story.nodes[nodeId];
      if (node.choices) {
        for (const choice of node.choices) {
          if (!story.nodes[choice.nextNodeId]) {
            throw new Error(`Node ${nodeId} choice "${choice.id}" references non-existent node ${choice.nextNodeId}`);
          }
        }
      }
    }

    // Check for unreachable nodes (except start node)
    const reachableNodes = new Set<string>();
    const nodesToVisit = [story.startNodeId];
    
    while (nodesToVisit.length > 0) {
      const currentNodeId = nodesToVisit.pop()!;
      if (reachableNodes.has(currentNodeId)) {
        continue;
      }
      
      reachableNodes.add(currentNodeId);
      const currentNode = story.nodes[currentNodeId];
      
      if (currentNode.choices) {
        for (const choice of currentNode.choices) {
          if (!reachableNodes.has(choice.nextNodeId)) {
            nodesToVisit.push(choice.nextNodeId);
          }
        }
      }
    }

    const unreachableNodes = nodeIds.filter(id => !reachableNodes.has(id));
    if (unreachableNodes.length > 0) {
      console.warn(`Warning: Found ${unreachableNodes.length} unreachable nodes: ${unreachableNodes.join(', ')}`);
    }

    // Ensure at least one end node exists
    const endNodes = nodeIds.filter(id => story.nodes[id].isEnd === true);
    if (endNodes.length === 0) {
      throw new Error('Story must contain at least one end node (isEnd: true)');
    }

    console.log(`Story reference validation passed: ${reachableNodes.size} reachable nodes, ${endNodes.length} end nodes`);
  }
}