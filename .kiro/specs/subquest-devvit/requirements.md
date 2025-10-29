# Requirements Document

## Introduction

SubQuest is an AI-assisted, community-driven storytelling game that runs entirely inside Reddit as a Devvit app. The app enables subreddit communities to play turn-based "Choose Your Own Adventure" style stories through Reddit posts and comment voting. Each story round creates a new Reddit post with story content and an image, while community members vote by upvoting comments representing different story choices. The app automatically advances the story based on the highest-voted option after a configurable time period.

## Requirements

### Requirement 1

**User Story:** As a subreddit moderator, I want to configure and start a new story game, so that my community can participate in an interactive storytelling experience.

#### Acceptance Criteria

1. WHEN a moderator accesses the settings form THEN the system SHALL provide options to upload a story.json file
2. WHEN a moderator uploads a valid story.json file THEN the system SHALL validate the JSON structure and store it in Redis
3. WHEN a moderator sets the roundDurationHours parameter THEN the system SHALL store this configuration for automatic story advancement
4. WHEN a moderator clicks start game THEN the system SHALL initialize the first story round and create the initial Reddit post
5. WHEN a moderator clicks reset game THEN the system SHALL clear all current game data and return to the initial state

### Requirement 2

**User Story:** As a community member, I want to participate in story rounds by voting on story choices, so that I can influence the direction of the community story.

#### Acceptance Criteria

1. WHEN a new story round begins THEN the system SHALL create a Reddit post with the current story segment, image, and title
2. WHEN the post is created THEN the system SHALL automatically post 2-3 top-level comments representing the available story choices (A/B/C)
3. WHEN community members upvote choice comments THEN the system SHALL track vote counts in Redis
4. WHEN the round duration expires THEN the system SHALL determine the winning choice based on highest upvote count
5. WHEN a choice is selected THEN the system SHALL advance to the corresponding story node for the next round

### Requirement 3

**User Story:** As a community member, I want the story to automatically progress at regular intervals, so that the game maintains momentum without requiring manual intervention.

#### Acceptance Criteria

1. WHEN a story round is active THEN the system SHALL schedule automatic advancement after the configured roundDurationHours
2. WHEN the scheduler triggers THEN the system SHALL count votes for all choice comments
3. WHEN vote counting is complete THEN the system SHALL select the choice with the highest upvote count
4. WHEN a choice is selected THEN the system SHALL create the next story round post automatically
5. IF the selected choice leads to an end node THEN the system SHALL create an end recap post instead of continuing

### Requirement 4

**User Story:** As a community member, I want to see rich story content with images, so that the storytelling experience is visually engaging.

#### Acceptance Criteria

1. WHEN the system processes a story node with an image URL THEN it SHALL fetch the image from the external URL
2. WHEN an image is fetched THEN the system SHALL rehost it using Devvit's media.upload API
3. WHEN creating a story post THEN the system SHALL include the rehosted image in the Reddit post
4. WHEN an image fails to load THEN the system SHALL continue with text-only content and log the error
5. WHEN no image is specified for a story node THEN the system SHALL create a text-only post

### Requirement 5

**User Story:** As a community member, I want to see a summary of our story journey when we reach an ending, so that I can reflect on the choices we made as a community.

#### Acceptance Criteria

1. WHEN the story reaches an end node THEN the system SHALL generate a recap post summarizing the played path
2. WHEN creating the recap THEN the system SHALL include all major story choices made by the community
3. WHEN creating the recap THEN the system SHALL include the final story outcome
4. WHEN the recap is posted THEN the system SHALL mark the game as completed in Redis
5. WHEN a game is completed THEN moderators SHALL be able to start a new story game

### Requirement 6

**User Story:** As a developer, I want the app to reliably store and retrieve game state, so that the story progression is consistent and persistent.

#### Acceptance Criteria

1. WHEN the app initializes THEN the system SHALL connect to Redis for data storage
2. WHEN storing game data THEN the system SHALL save current story node, round number, and voting data to Redis
3. WHEN retrieving game data THEN the system SHALL load the current game state from Redis
4. WHEN the app restarts THEN the system SHALL resume from the last saved game state
5. WHEN Redis operations fail THEN the system SHALL handle errors gracefully and provide appropriate fallbacks

### Requirement 7

**User Story:** As a subreddit moderator, I want to understand how to set up and use the app, so that I can successfully deploy it for my community.

#### Acceptance Criteria

1. WHEN accessing the project documentation THEN the system SHALL provide a clear README.md with setup instructions
2. WHEN reviewing the documentation THEN it SHALL include the JSON schema for story files
3. WHEN reviewing the documentation THEN it SHALL include example story snippets
4. WHEN reviewing the documentation THEN it SHALL include future enhancement ideas
5. WHEN examining the code THEN it SHALL include detailed comments explaining each Devvit API usage

### Requirement 8

**User Story:** As a developer, I want the codebase to be well-structured and maintainable, so that the app can be easily extended and debugged.

#### Acceptance Criteria

1. WHEN examining the project structure THEN it SHALL follow the defined folder organization (/src/index.ts, /src/handlers/, /src/utils/, /assets/)
2. WHEN reading the code THEN it SHALL use TypeScript with clean, readable implementations
3. WHEN reviewing functions THEN they SHALL include inline comments explaining the logic
4. WHEN examining the code THEN it SHALL follow Devvit's recommended coding conventions
5. WHEN viewing the main file THEN it SHALL include a motivational header comment about "turning Reddit into an adventure"