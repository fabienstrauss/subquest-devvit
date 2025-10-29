import { Devvit } from '@devvit/public-api';
import { SchedulerHandler } from './handlers/schedulerHandler.js';
import { SettingsHandler } from './handlers/settingsHandler.js';
import { PostManager } from './handlers/postManager.js';
import { VoteCounter } from './handlers/voteCounter.js';
import { StoryEngine } from './utils/storyEngine.js';
import { RedisManager } from './utils/redisManager.js';

// Configure required permissions
Devvit.configure({
  redditAPI: true,
  redis: true,
  media: true,
});


// App settings configuration
Devvit.addSettings([
  {
    type: 'paragraph',
    name: 'storyJson',
    label: 'Story JSON Content',
    helpText: 'Paste your complete story JSON here. Must include title, description, startNodeId, and nodes.',
  },
  {
    type: 'number',
    name: 'roundDurationHours',
    label: 'Round Duration (Hours)',
    helpText: 'How long each story round should last (1-168 hours)',
    defaultValue: 24,
  },
  {
    type: 'boolean',
    name: 'testMode',
    label: 'Test Mode (Short Rounds)',
    helpText: 'Enable test mode with 2-minute rounds for quick testing',
    defaultValue: false,
  },
  {
    type: 'boolean',
    name: 'manualOnly',
    label: 'Manual Advancement Only',
    helpText: 'Disable automatic round advancement - rounds only advance when moderators click "Advance Round"',
    defaultValue: false,
  },
  {
    type: 'boolean',
    name: 'startGame',
    label: 'Start New Game',
    helpText: 'Check this box and save to start a new game with the uploaded story',
    defaultValue: false,
  },
  {
    type: 'boolean',
    name: 'resetGame',
    label: 'Reset Current Game',
    helpText: 'Check this box and save to reset the current game (WARNING: This will clear all progress)',
    defaultValue: false,
  },
]);

// Main control panel
Devvit.addMenuItem({
  label: '🎲 SubQuest Manager',
  location: 'subreddit',
  onPress: async (event, context) => {
    try {
      const redisManager = new RedisManager(context);
      const gameState = await redisManager.getGameState();
      const storyData = await redisManager.getStoryData();

      let message = '🎲 SubQuest Manager\n\n';

      if (!gameState?.isActive) {
        message += '❌ No active game\n\n';
        message += '📋 Next Steps:\n';
        message += '1. Add story JSON in app settings\n';
        message += '2. Use "🚀 Start Game" to begin\n';
        message += '3. Use "⚡ Quick Actions" for controls';
      } else {
        const storyEngine = new StoryEngine(context);
        const timeRemaining = await storyEngine.getTimeRemainingInRound();
        const minutesRemaining = Math.max(0, Math.round(timeRemaining / (1000 * 60)));

        message += `✅ "${storyData?.title || 'Unknown Story'}"\n`;
        message += `📍 Round ${gameState.roundNumber}\n`;
        message += `⏰ ${minutesRemaining} min remaining\n`;
        message += `🎯 Test Mode: ${gameState.testMode ? 'ON' : 'OFF'}\n\n`;

        const voteCounter = new VoteCounter(context);
        const choices = await voteCounter.getChoicesWithVotes(gameState.roundNumber);

        if (choices.length > 0) {
          message += '🗳️ Current Votes:\n';
          choices.slice(0, 3).forEach((choice, i) => {
            message += `${i === 0 ? '🏆' : '📊'} ${choice.choiceText.substring(0, 30)}...: ${choice.voteCount}\n`;
          });
        }
      }

      return context.ui.showToast(message);
    } catch (error) {
      Logger.error('Manager', error);
      return context.ui.showToast('❌ Error accessing SubQuest Manager');
    }
  },
});

Devvit.addMenuItem({
  label: '🚀 Start Game',
  location: 'subreddit',
  onPress: async (event, context) => {
    try {
      const settings = await context.settings.getAll();
      const storyJson = settings.storyJson as string;

      if (!storyJson?.trim()) {
        return context.ui.showToast('❌ No story found in settings. Please add story JSON in app settings first.');
      }

      let storyData;
      try {
        storyData = JSON.parse(storyJson);
      } catch (error) {
        return context.ui.showToast('❌ Invalid story JSON in settings. Please check the format.');
      }

      const testMode = !!settings.testMode;
      const duration = Number(settings.roundDurationHours) || 24;
      const manualOnly = !!settings.manualOnly;

      const settingsHandler = new SettingsHandler(context);

      const uploadResult = await settingsHandler.handleStoryUpload(storyJson);
      if (!uploadResult.success) {
        return context.ui.showToast(`❌ Story upload failed: ${uploadResult.message}`);
      }

      const startResult = await settingsHandler.handleStartGame(duration, testMode, manualOnly);
      if (!startResult.success) {
        return context.ui.showToast(`❌ Game start failed: ${startResult.message}`);
      }

      const postManager = new PostManager(context);
      const subreddit = await context.reddit.getCurrentSubreddit();
      const postResult = await postManager.createStoryRoundPost(subreddit.name);

      if (postResult.success) {
        const advanceMode = manualOnly ? 'manual advancement only' : `auto-advance every ${duration} ${testMode ? 'minutes' : 'hours'}`;
        return context.ui.showToast(`✅ "${storyData.title}" started! First post created. ${advanceMode}.`);
      } else {
        return context.ui.showToast(`⚠️ Game started but post failed: ${postResult.error}`);
      }
    } catch (error) {
      Logger.error('StartGame', error);
      return context.ui.showToast('❌ Error starting game');
    }
  },
});

Devvit.addMenuItem({
  label: '⚡ Quick Actions',
  location: 'subreddit',
  onPress: async (event, context) => {
    try {
      const redisManager = new RedisManager(context);
      const gameState = await redisManager.getGameState();

      if (!gameState?.isActive) {
        return context.ui.showToast('❌ No active game. Use "🚀 Start Game" first.');
      }

      const voteCounter = new VoteCounter(context);
      const choicesWithVotes = await voteCounter.getChoicesWithVotes(gameState.roundNumber);

      let message = `⚡ Round ${gameState.roundNumber} Actions\n\n`;

      if (choicesWithVotes.length > 0) {
        message += '🗳️ Current Votes:\n';
        choicesWithVotes.forEach((choice, index) => {
          const shortText = choice.choiceText.length > 25 ? choice.choiceText.substring(0, 25) + '...' : choice.choiceText;
          message += `${index === 0 ? '🏆' : '📊'} ${shortText}: ${choice.voteCount}\n`;
        });
        message += '\n';
      }

      const timeRemaining = await new StoryEngine(context).getTimeRemainingInRound();
      const minutesRemaining = Math.max(0, Math.round(timeRemaining / (1000 * 60)));

      if (minutesRemaining > 0) {
        message += `⏰ Auto-advance in ${minutesRemaining} minutes\n`;
        message += `⚡ Or use "Advance Round" to skip waiting`;
      } else {
        message += `⏰ Round expired - ready to advance!`;
      }

      return context.ui.showToast(message);
    } catch (error) {
      Logger.error('QuickActions', error);
      return context.ui.showToast('❌ Error getting quick actions');
    }
  },
});

// Track SubQuest post submissions
Devvit.addTrigger({
  event: 'PostSubmit',
  onEvent: async (event, context) => {
    try {
      if (!event.author?.name || !event.subreddit?.name) return;

      const postTitle = event.post?.title || '';
      if (postTitle.includes('SubQuest') || postTitle.includes('🎲')) {
        Logger.info('PostSubmit', `SubQuest post detected: ${postTitle}`);
      }
    } catch (error) {
      Logger.error('PostSubmit', error);
    }
  },
});

// Track comments on SubQuest posts
Devvit.addTrigger({
  event: 'CommentSubmit',
  onEvent: async (event, context) => {
    try {
      if (!event.subreddit?.name) return;

      const parentPost = event.post;
      if (parentPost?.title?.includes('SubQuest') || parentPost?.title?.includes('🎲')) {
        Logger.info('CommentSubmit', `Comment on SubQuest post: ${parentPost.title}`);
      }
    } catch (error) {
      Logger.error('CommentSubmit', error);
    }
  },
});

// Automatic round advancement scheduler
Devvit.addSchedulerJob({
  name: 'subquest_round_advance',
  onRun: async (event, context) => {
    try {
      // Create context compatible with SchedulerHandler
      const schedulerContext = {
        scheduler: context.scheduler,
        reddit: context.reddit,
        redis: context.redis,
        settings: context.settings,
        media: context.media
      } as any;

      const schedulerHandler = new SchedulerHandler(schedulerContext);
      const result = await schedulerHandler.handleRoundAdvancement(event);

      if (!result.success) {
        throw new Error(`Round advancement failed: ${result.error}`);
      }

      Logger.info('Scheduler', `Round advancement completed: ${result.details}`);
    } catch (error) {
      Logger.error('Scheduler', error);
      throw error;
    }
  },
});

Devvit.addMenuItem({
  label: '🎯 Advance Round',
  location: 'subreddit',
  onPress: async (event, context) => {
    try {
      const schedulerHandler = new SchedulerHandler(context);
      const result = await schedulerHandler.handleRoundAdvancement({
        name: 'manual_advance',
        data: { manual: true }
      });

      if (result.success) {
        return context.ui.showToast(`✅ Round advanced! ${result.details}`);
      } else {
        return context.ui.showToast(`❌ Failed to advance: ${result.error}`);
      }
    } catch (error) {
      Logger.error('AdvanceRound', error);
      return context.ui.showToast('❌ Error during round advancement');
    }
  },
});

Devvit.addMenuItem({
  label: '🛑 Stop Game',
  location: 'subreddit',
  onPress: async (event, context) => {
    try {
      const settingsHandler = new SettingsHandler(context);
      const resetResult = await settingsHandler.handleResetGame();

      if (resetResult.success) {
        return context.ui.showToast(`✅ Game stopped and reset. Use "🚀 Start Game" to play again.`);
      } else {
        return context.ui.showToast(`❌ Stop failed: ${resetResult.message}`);
      }
    } catch (error) {
      Logger.error('StopGame', error);
      return context.ui.showToast('❌ Error stopping game');
    }
  },
});

Devvit.addMenuItem({
  label: '🧹 Cleanup Scheduler',
  location: 'subreddit',
  onPress: async (event, context) => {
    try {
      const schedulerHandler = new SchedulerHandler(context);
      const cleanupResult = await schedulerHandler.cleanupGameScheduler();

      if (cleanupResult.success) {
        return context.ui.showToast(`✅ Scheduler cleaned up successfully. Old scheduled jobs removed.`);
      } else {
        return context.ui.showToast(`❌ Cleanup failed: ${cleanupResult.error}`);
      }
    } catch (error) {
      Logger.error('CleanupScheduler', error);
      return context.ui.showToast('❌ Error cleaning up scheduler');
    }
  },
});

Devvit.addMenuItem({
  label: '🔍 Debug Game State',
  location: 'subreddit',
  onPress: async (event, context) => {
    try {
      const redisManager = new RedisManager(context);
      const gameState = await redisManager.getGameState();
      const schedulerHandler = new SchedulerHandler(context);
      
      if (!gameState) {
        return context.ui.showToast('❌ No game state found');
      }

      const timeRemaining = await new StoryEngine(context).getTimeRemainingInRound();
      const minutesRemaining = Math.round(timeRemaining / (1000 * 60));
      const nextSchedule = await schedulerHandler.getNextScheduledRound();
      
      let message = `🔍 Debug Info\n\n`;
      message += `Round: ${gameState.roundNumber}\n`;
      message += `Node: ${gameState.currentNodeId}\n`;
      message += `Test Mode: ${gameState.testMode ? 'YES' : 'NO'}\n`;
      message += `Duration: ${gameState.roundDurationHours} ${gameState.testMode ? 'min' : 'hrs'}\n`;
      message += `Time Left: ${minutesRemaining} min\n`;
      message += `Started: ${new Date(gameState.roundStartTime).toLocaleTimeString()}\n`;
      message += `Next Schedule: ${nextSchedule ? 'YES' : 'NO'}`;

      return context.ui.showToast(message);
    } catch (error) {
      Logger.error('DebugGameState', error);
      return context.ui.showToast('❌ Debug error');
    }
  },
});

Devvit.addMenuItem({
  label: '⚡ Force Schedule Check',
  location: 'subreddit',
  onPress: async (event, context) => {
    try {
      const schedulerHandler = new SchedulerHandler(context);
      const redisManager = new RedisManager(context);
      const gameState = await redisManager.getGameState();
      
      if (!gameState?.isActive) {
        return context.ui.showToast('❌ No active game to schedule');
      }

      // Check if round is due for advancement
      const isDue = await schedulerHandler.isRoundAdvancementDue();
      
      if (isDue) {
        // Manually trigger advancement
        const result = await schedulerHandler.manualRoundAdvancement(gameState.roundNumber);
        if (result.success) {
          return context.ui.showToast(`✅ Round was overdue and advanced! ${result.details}`);
        } else {
          return context.ui.showToast(`❌ Overdue round failed to advance: ${result.error}`);
        }
      } else {
        // Re-schedule if needed
        const scheduleResult = await schedulerHandler.scheduleNextRound(gameState.roundDurationHours, gameState.roundNumber);
        if (scheduleResult.success) {
          return context.ui.showToast(`✅ Scheduler refreshed: ${scheduleResult.jobId}`);
        } else {
          return context.ui.showToast(`❌ Schedule refresh failed: ${scheduleResult.error}`);
        }
      }
    } catch (error) {
      Logger.error('ForceScheduleCheck', error);
      return context.ui.showToast('❌ Schedule check error');
    }
  },
});

// Logging utility
class Logger {
  static error(operation: string, error: any): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[SubQuest:${operation}] ${message}`);
  }

  static info(operation: string, message: string): void {
    console.log(`[SubQuest:${operation}] ${message}`);
  }
}

// Export the configured Devvit app
export default Devvit;