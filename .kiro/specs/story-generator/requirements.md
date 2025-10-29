# Requirements Document

## Introduction

The Story Generator is a simplified Google Colab notebook that uses Ollama with Llama models to create meaningful, branching interactive stories for the SubQuest Devvit app. The tool focuses on generating high-quality story content with proper decision trees, using GPU acceleration for better model performance, and simplified Google Drive integration for asset management.

## Requirements

### Requirement 1

**User Story:** As a subreddit moderator, I want to create meaningful branching stories using powerful local AI models, so that I get high-quality content without API costs or complexity.

#### Acceptance Criteria

1. WHEN the user opens the notebook THEN the system SHALL automatically install and configure Ollama with GPU support
2. WHEN Ollama is ready THEN the system SHALL pull and test a Llama model (starting with llama3.2:1b, with options for larger models)
3. WHEN the user provides story parameters THEN the system SHALL capture title, theme, target length (3-6 rounds), and story concept
4. WHEN generating story content THEN the system SHALL use Ollama to create meaningful, contextual choices that advance the narrative
5. WHEN creating decision points THEN the system SHALL ensure each choice leads to genuinely different story paths
6. WHEN the story is complete THEN the system SHALL validate that all paths create a proper branching narrative structure

### Requirement 2

**User Story:** As a subreddit moderator, I want simple Google Drive integration for storing generated assets, so that I can easily manage and access my story files.

#### Acceptance Criteria

1. WHEN the user needs file storage THEN the system SHALL use Google Colab's built-in Drive mounting with drive.mount('/content/drive')
2. WHEN Drive is mounted THEN the system SHALL create a story project folder in the user's Drive
3. WHEN generating images THEN the system SHALL use the existing local SDXL-Turbo implementation for consistency
4. WHEN images are created THEN the system SHALL save them to the mounted Drive folder with descriptive names
5. WHEN the story is complete THEN the system SHALL save the final JSON to Drive and provide the folder path

### Requirement 3

**User Story:** As a subreddit moderator, I want the AI to generate contextually relevant choices that create meaningful story branches, so that players experience a truly interactive narrative.

#### Acceptance Criteria

1. WHEN generating story nodes THEN the system SHALL use the current story context to create relevant, specific choices
2. WHEN creating choices THEN the system SHALL ensure each option leads to different narrative outcomes, not the same generic options
3. WHEN advancing the story THEN the system SHALL maintain narrative coherence while allowing for meaningful player agency
4. WHEN reaching decision points THEN the system SHALL generate 2-4 contextually appropriate choices that feel natural to the story
5. WHEN creating branches THEN the system SHALL ensure different paths explore different aspects of the story theme

### Requirement 4

**User Story:** As a subreddit moderator, I want the notebook to leverage GPU acceleration for better AI performance, so that I get higher quality story generation.

#### Acceptance Criteria

1. WHEN the notebook starts THEN the system SHALL detect and configure GPU usage for Ollama
2. WHEN installing Ollama THEN the system SHALL set OLLAMA_USE_CUDA=1 to enable GPU acceleration
3. WHEN running models THEN the system SHALL verify GPU utilization for faster inference
4. WHEN choosing models THEN the system SHALL provide options for different model sizes based on available GPU memory
5. WHEN generating content THEN the system SHALL use GPU acceleration to improve response quality and speed

### Requirement 5

**User Story:** As a subreddit moderator, I want a simplified notebook without complex error handling or checkpoint systems, so that I can focus on creating good stories without unnecessary complexity.

#### Acceptance Criteria

1. WHEN the user runs the notebook THEN the system SHALL provide a streamlined workflow with minimal configuration
2. WHEN errors occur THEN the system SHALL use basic error messages without complex recovery systems
3. WHEN generating content THEN the system SHALL focus on core functionality without extensive checkpoint management
4. WHEN the process completes THEN the system SHALL provide the final JSON and clear next steps
5. WHEN using the notebook THEN the system SHALL prioritize simplicity and effectiveness over comprehensive error handling

### Requirement 6

**User Story:** As a subreddit moderator, I want the generated story to be compatible with the existing SubQuest format, so that I can immediately use it in my subreddit.

#### Acceptance Criteria

1. WHEN generating the story structure THEN the system SHALL follow the exact JSON schema used by existing demo stories
2. WHEN creating story nodes THEN the system SHALL include all required fields: id, title, content, imageUrl, choices, and isEnd
3. WHEN generating choices THEN the system SHALL include proper id, text, and nextNodeId references
4. WHEN creating the final JSON THEN the system SHALL validate the structure against the SubQuest format
5. WHEN the story is complete THEN the system SHALL ensure all node references are valid and the story graph is properly connected

### Requirement 7

**User Story:** As a subreddit moderator, I want to visualize the story structure to verify it creates meaningful branches, so that I can ensure the story provides genuine player choice.

#### Acceptance Criteria

1. WHEN the story is generated THEN the system SHALL create a visual decision tree showing all story paths
2. WHEN displaying the tree THEN the system SHALL clearly show how choices lead to different narrative outcomes
3. WHEN reviewing the structure THEN the system SHALL highlight any issues like repetitive choices or broken paths
4. WHEN the visualization is complete THEN the system SHALL allow the user to proceed with image generation
5. WHEN the final story is ready THEN the system SHALL provide both the JSON file and visualization for review