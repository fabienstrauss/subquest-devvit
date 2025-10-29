import { Context, Post, RichTextBuilder } from '@devvit/public-api';
import { StoryEngine } from '../utils/storyEngine.js';
import { MediaHandler } from '../utils/mediaHandler.js';
import { RedisManager } from '../utils/redisManager.js';
import { StoryNode, Choice, VoteData } from '../types/index.js';

export interface PostCreationResult {
  success: boolean;
  postId?: string;
  choiceCommentIds?: string[];
  error?: string;
}

export interface PostFormatConfig {
  includeRoundNumber?: boolean;
  titlePrefix?: string;
  maxContentLength?: number;
  choiceLabels?: string[];
}
export class PostManager {
  private context: Context;
  private storyEngine: StoryEngine;
  private mediaHandler: MediaHandler;
  private redisManager: RedisManager;
  private config: Required<PostFormatConfig>;

  constructor(context: Context, config: PostFormatConfig = {}) {
    this.context = context;
    this.storyEngine = new StoryEngine(context);
    this.mediaHandler = new MediaHandler(context);
    this.redisManager = new RedisManager(context);
    
    this.config = {
      includeRoundNumber: config.includeRoundNumber ?? true,
      titlePrefix: config.titlePrefix ?? '🎲 SubQuest',
      maxContentLength: config.maxContentLength ?? 10000,
      choiceLabels: config.choiceLabels ?? ['A', 'B', 'C', 'D', 'E']
    };
  }

  async createStoryRoundPost(subredditName: string): Promise<PostCreationResult> {
    try {
      const currentNode = await this.storyEngine.getCurrentNode();
      if (!currentNode) {
        return { success: false, error: 'No current story node found' };
      }

      const gameState = await this.storyEngine.getGameState();
      if (!gameState) {
        return { success: false, error: 'No active game state found' };
      }

      const storyMetadata = await this.storyEngine.getStoryMetadata();
      if (!storyMetadata) {
        return { success: false, error: 'No story metadata found' };
      }

      const postTitle = this.formatPostTitle(
        storyMetadata.title,
        currentNode.title,
        gameState.roundNumber
      );

      let mediaResult: any = undefined;
      if (currentNode.imageUrl) {
        const processedMedia = await this.mediaHandler.processImageWithFallback(currentNode.imageUrl);
        if (processedMedia) {
          mediaResult = processedMedia;
        }
      }

      const postContent = this.formatStoryContent(currentNode, gameState.roundNumber);
      const post = await this.createRedditPost(subredditName, postTitle, postContent, mediaResult);

      let choiceCommentIds: string[] = [];
      if (!currentNode.isEnd && currentNode.choices && currentNode.choices.length > 0) {
        choiceCommentIds = await this.createChoiceComments(post, currentNode.choices);
        await this.storeChoiceCommentMapping(gameState.roundNumber, currentNode.choices, choiceCommentIds);
      }

      return {
        success: true,
        postId: post.id,
        choiceCommentIds: choiceCommentIds
      };
    } catch (error) {
      console.error('[PostManager] Failed to create story round post:', error);
      return {
        success: false,
        error: `Post creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async createChoiceComments(post: Post, choices: Choice[]): Promise<string[]> {
    try {
      const commentIds: string[] = [];
      
      for (let i = 0; i < choices.length; i++) {
        const choice = choices[i];
        const label = this.config.choiceLabels[i] || `${i + 1}`;
        const commentText = this.formatChoiceComment(label, choice.text);
        
        const comment = await this.context.reddit.submitComment({
          id: post.id,
          text: commentText
        });
        
        commentIds.push(comment.id);
        
        // Rate limiting delay
        if (i < choices.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 6000));
        }
      }
      
      return commentIds;
    } catch (error) {
      console.error('[PostManager] Failed to create choice comments:', error);
      throw new Error(`Choice comment creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create an end game recap post summarizing the story journey
   * @param subredditName - Name of the subreddit to post in
   * @returns Promise resolving to PostCreationResult
   */
  async createEndGameRecapPost(subredditName: string): Promise<PostCreationResult> {
    try {
      console.log(`[PostManager] Creating end game recap post for r/${subredditName}`);

      // Get story metadata and final game state
      const storyMetadata = await this.storyEngine.getStoryMetadata();
      if (!storyMetadata) {
        return {
          success: false,
          error: 'No story metadata found - cannot create recap'
        };
      }

      const gameState = await this.storyEngine.getGameState();
      if (!gameState) {
        return {
          success: false,
          error: 'No game state found - cannot create recap'
        };
      }

      const currentNode = await this.storyEngine.getCurrentNode();
      if (!currentNode || !currentNode.isEnd) {
        return {
          success: false,
          error: 'Current node is not an end node - cannot create recap'
        };
      }

      // Get detailed story path for recap
      const storyPathDetails = await this.storyEngine.getStoryPathWithDetails();

      // Format recap post title
      const recapTitle = this.formatRecapTitle(storyMetadata.title, gameState.roundNumber);

      // Format recap content
      const recapContent = await this.formatRecapContent(
        storyMetadata,
        currentNode,
        storyPathDetails,
        gameState.roundNumber
      );

      // Process final image if available
      let mediaResult: any = undefined;
      if (currentNode.imageUrl) {
        console.log(`[PostManager] Processing final image: ${currentNode.imageUrl}`);
        const processedMedia = await this.mediaHandler.processImageWithFallback(currentNode.imageUrl);
        if (processedMedia) {
          mediaResult = processedMedia;
          console.log(`[PostManager] Final image processed successfully`);
        }
      }

      // Create the recap post
      const post = await this.createRedditPost(subredditName, recapTitle, recapContent, mediaResult);

      // Mark game as completed
      await this.storyEngine.completeGame();

      console.log(`[PostManager] End game recap post created successfully: ${post.id}`);

      return {
        success: true,
        postId: post.id,
        choiceCommentIds: [] // No choice comments for recap posts
      };

    } catch (error) {
      console.error('[PostManager] Failed to create end game recap post:', error);
      return {
        success: false,
        error: `Recap post creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Create a Reddit post with title, content, and optional image
   * @param subredditName - Subreddit to post in
   * @param title - Post title
   * @param content - Post content
   * @param mediaResult - Optional media result with mediaId and mediaUrl
   * @returns Promise resolving to created Post
   */
  private async createRedditPost(
    subredditName: string,
    title: string,
    content: string,
    mediaResult?: any
  ): Promise<Post> {
    try {
      // Truncate content if it exceeds maximum length
      const truncatedContent = content.length > this.config.maxContentLength
        ? content.substring(0, this.config.maxContentLength - 3) + '...'
        : content;

      // Create post with or without image
      if (mediaResult && mediaResult.mediaId) {
        // For posts with images, use richtext with image and formatted text
        console.log(`[PostManager] Creating post with mediaId: ${mediaResult.mediaId}`);
        
        // Remove round header from content since it's in the title
        const contentWithoutRoundHeader = truncatedContent.replace(/^\*\*Round \d+\*\*\n\n/, '');
        const contentWithWorkaround = ' \n\n' + contentWithoutRoundHeader;
        
        const richText = new RichTextBuilder()
          .image({ mediaId: mediaResult.mediaId })
          .codeBlock({}, (cb) => cb.rawText(contentWithWorkaround));

        return await this.context.reddit.submitPost({
          title: title,
          subredditName: subredditName,
          richtext: richText
        });
      } else {
        return await this.context.reddit.submitPost({
          title: title,
          subredditName: subredditName,
          text: truncatedContent
        });
      }
    } catch (error) {
      console.error('[PostManager] Failed to create Reddit post:', error);
      throw new Error(`Reddit post creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }



  private formatPostTitle(storyTitle: string, nodeTitle: string, roundNumber: number): string {
    const parts = [this.config.titlePrefix];
    
    if (this.config.includeRoundNumber) {
      parts.push(`Round ${roundNumber}`);
    }
    
    parts.push(`${storyTitle}: ${nodeTitle}`);
    
    return parts.join(' - ');
  }

  private formatRecapTitle(storyTitle: string, finalRound: number): string {
    return `${this.config.titlePrefix} - FINALE: ${storyTitle} (${finalRound} Rounds Complete!)`;
  }

  private formatStoryContent(node: StoryNode, roundNumber: number): string {
    const lines: string[] = [];
    
    // Add round header
    lines.push(`**Round ${roundNumber}**`);
    lines.push('');
    
    // Add story content
    lines.push(node.content);
    lines.push('');
    
    // Add voting instructions if there are choices
    if (!node.isEnd && node.choices && node.choices.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('**🗳️ How to Vote:**');
      lines.push('Upvote the comment below that represents your choice!');
      lines.push('The option with the most upvotes will determine our next step.');
      lines.push('');
      lines.push('*Voting will close automatically when the next round begins.*');
    } else if (node.isEnd) {
      lines.push('---');
      lines.push('');
      lines.push('**🎉 THE END**');
      lines.push('');
      lines.push('Thank you for participating in this community adventure!');
      lines.push('Stay tuned for the recap post summarizing our journey.');
    }
    
    return lines.join('\n');
  }

  private formatChoiceComment(label: string, choiceText: string): string {
    return `**Option ${label}:** ${choiceText}`;
  }

  /**
   * Format end game recap content
   * @param storyMetadata - Story metadata
   * @param finalNode - Final story node
   * @param pathDetails - Detailed story path
   * @param totalRounds - Total number of rounds played
   * @returns Formatted recap content
   */
  private async formatRecapContent(
    storyMetadata: { title: string; description: string },
    finalNode: StoryNode,
    pathDetails: Array<{ nodeId: string; title: string; choiceMade?: string }>,
    totalRounds: number
  ): Promise<string> {
    const lines: string[] = [];
    
    // Header
    lines.push(`# 🎉 ${storyMetadata.title} - Adventure Complete!`);
    lines.push('');
    lines.push(`After ${totalRounds} rounds of community voting, our adventure has reached its conclusion!`);
    lines.push('');
    
    // Final outcome
    lines.push('## 🏁 Final Outcome');
    lines.push('');
    lines.push(`**${finalNode.title}**`);
    lines.push('');
    lines.push(finalNode.content);
    lines.push('');
    
    // Story path summary
    lines.push('## 📖 Our Journey');
    lines.push('');
    lines.push('Here\'s the path our community chose:');
    lines.push('');
    
    for (let i = 0; i < pathDetails.length; i++) {
      const detail = pathDetails[i];
      const roundNum = i + 1;
      
      lines.push(`**Round ${roundNum}: ${detail.title}**`);
      
      if (detail.choiceMade && i < pathDetails.length - 1) {
        lines.push(`→ Community chose: *${detail.choiceMade}*`);
      }
      
      lines.push('');
    }
    
    // Community thanks
    lines.push('## 🙏 Thank You!');
    lines.push('');
    lines.push('This adventure was made possible by our amazing community members who participated in the voting process.');
    lines.push('Every upvote helped shape the direction of our story!');
    lines.push('');
    lines.push('*Ready for another adventure? Ask your moderators to start a new SubQuest!*');
    
    return lines.join('\n');
  }

  private async storeChoiceCommentMapping(
    roundNumber: number,
    choices: Choice[],
    commentIds: string[]
  ): Promise<void> {
    try {
      if (choices.length !== commentIds.length) {
        throw new Error('Mismatch between choices and comment IDs');
      }

      const choiceMapping: Record<string, string> = {};
      for (let i = 0; i < choices.length; i++) {
        choiceMapping[choices[i].id] = commentIds[i];
      }

      const gameState = await this.storyEngine.getGameState();
      if (!gameState) {
        throw new Error('No game state found');
      }

      const roundEndTime = gameState.roundStartTime + (gameState.roundDurationHours * 60 * 60 * 1000);

      const voteData: VoteData = {
        choices: choiceMapping,
        roundEndTime: roundEndTime
      };

      await this.redisManager.setVoteData(roundNumber, voteData);
    } catch (error) {
      console.error('[PostManager] Failed to store choice-comment mapping:', error);
      throw new Error(`Choice mapping storage failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getChoiceCommentMapping(roundNumber: number): Promise<Record<string, string> | null> {
    try {
      const voteData = await this.redisManager.getVoteData(roundNumber);
      return voteData?.choices || null;
    } catch (error) {
      console.error(`[PostManager] Failed to get choice-comment mapping for round ${roundNumber}:`, error);
      return null;
    }
  }

  async isCurrentRoundExpired(): Promise<boolean> {
    try {
      return await this.storyEngine.isRoundExpired();
    } catch (error) {
      console.error('[PostManager] Failed to check round expiration:', error);
      return false;
    }
  }

  async getTimeRemainingInCurrentRound(): Promise<number> {
    try {
      return await this.storyEngine.getTimeRemainingInRound();
    } catch (error) {
      console.error('[PostManager] Failed to get time remaining:', error);
      return 0;
    }
  }
}