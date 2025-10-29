/**
 * Core TypeScript interfaces for SubQuest - turning Reddit into an adventure!
 * These interfaces define the structure for our community-driven storytelling game.
 */

/**
 * Represents a single node in the story tree
 */
export interface StoryNode {
  /** Unique identifier for this story node */
  id: string;
  /** Title of this story segment */
  title: string;
  /** Main story content for this node */
  content: string;
  /** Optional image URL to accompany this story segment */
  imageUrl?: string;
  /** Available choices for the community to vote on (undefined for end nodes) */
  choices?: Choice[];
  /** Whether this node represents an ending to the story */
  isEnd?: boolean;
}

/**
 * Represents a choice option that the community can vote on
 */
export interface Choice {
  /** Unique identifier for this choice */
  id: string;
  /** Description text shown to the community */
  text: string;
  /** ID of the story node this choice leads to */
  nextNodeId: string;
}

/**
 * Current state of the active game
 */
export interface GameState {
  /** ID of the current story node being played */
  currentNodeId: string;
  /** Current round number (starts at 1) */
  roundNumber: number;
  /** Array of node IDs representing the path taken through the story */
  storyPath: string[];
  /** Whether a game is currently active */
  isActive: boolean;
  /** Timestamp when the current round started */
  roundStartTime: number;
  /** Duration in hours for each round (or minutes if in test mode) */
  roundDurationHours: number;
  /** Whether test mode is enabled (rounds in minutes instead of hours) */
  testMode?: boolean;
}

/**
 * Application configuration settings
 */
export interface AppConfig {
  /** Duration in hours for each story round */
  roundDurationHours: number;
  /** Whether a game is currently active */
  isGameActive: boolean;
  /** Name of the subreddit this app is running in */
  subredditName: string;
}

/**
 * Complete story structure loaded from JSON
 */
export interface Story {
  /** Title of the story */
  title: string;
  /** Description of the story */
  description: string;
  /** ID of the starting node */
  startNodeId: string;
  /** Map of node IDs to story nodes */
  nodes: Record<string, StoryNode>;
}

/**
 * Vote tracking data for a specific round
 */
export interface VoteData {
  /** Map of choice IDs to their corresponding comment IDs */
  choices: Record<string, string>;
  /** Timestamp when this round ends */
  roundEndTime: number;
}

/**
 * Result of vote counting for a choice
 */
export interface VoteResult {
  /** ID of the choice */
  choiceId: string;
  /** Reddit comment ID for this choice */
  commentId: string;
  /** Number of upvotes received */
  upvotes: number;
}