# SubQuest - Turn Reddit into an Adventure

SubQuest transforms Reddit communities into interactive storytelling platforms where members collectively shape epic adventures through voting. Create engaging "Choose Your Own Adventure" experiences that unfold over time, with rich visuals and community-driven narratives.

## 🚀 Getting Started

### Installation on Your Subreddit

1. **Install the Devvit CLI**:
   ```bash
   npm install -g devvit
   ```

2. **Clone and deploy**:
   ```bash
   git clone https://github.com/fabienstrauss/subquest-devvit.git
   cd subquest-devvit
   npm install
   devvit upload
   devvit install your-subreddit-name
   ```

3. **Configure your first story**:
   - Go to your subreddit's Mod Tools → Apps → SubQuest → Settings
   - Enable "Test Mode" for quick testing (2-minute rounds)
   - Add your story content (see options below)
   - Check "Start New Game" and save

### Creating Your Story

You have two options for creating stories:

#### Option 1: AI-Powered Story Generator (Recommended)
Use our **no-code Google Colab notebook** to create complete interactive stories with AI assistance:

**📚 [Open Story Generator in Google Colab](https://colab.research.google.com/drive/1-NQaoHY3uH240iBSP8PGfBV0X82KuWPD?usp=sharing)**

- **No coding required** - just fill out simple forms
- **AI generates** story content, choices, and structure  
- **Visual story tree** to review your adventure
- **AI artwork generation** for each scene
- **Exports ready-to-use JSON** for SubQuest

*The notebook is also available in this repository as `story_generator.ipynb`*

#### Option 2: Manual JSON Creation
Create stories manually using our JSON format (see examples in `/assets/` folder):
- `demo_simple.json` - Basic cave exploration
- `demo_fantasy.json` - Epic fantasy adventure  
- `demo_finance.json` - Business decision scenarios

## 🎮 How It Works

SubQuest creates turn-based storytelling games entirely within Reddit:

1. **Story begins** with a Reddit post containing rich content and images
2. **Choices appear** as comments (A, B, C, etc.) that users can upvote
3. **Community votes** determine the story direction
4. **Automatic advancement** after your configured time period
5. **Story continues** based on the winning choice until an ending is reached

### Key Features

- **Community-Driven Storytelling**: Let your community collectively choose the path
- **Automated Story Progression**: Stories advance automatically based on votes
- **Rich Media Support**: Images are automatically rehosted and optimized
- **Flexible Story Structure**: Support for complex branching narratives with multiple endings
- **Easy Moderation**: Simple settings interface for story management
- **Persistent Game State**: Stories resume seamlessly even after app restarts

## 🎨 Story Generator

Create complete interactive stories using the AI-powered notebook:

**📚 [Open Story Generator in Google Colab](https://colab.research.google.com/drive/1-NQaoHY3uH240iBSP8PGfBV0X82KuWPD?usp=sharing)**

The notebook (`story_generator.ipynb`) provides a no-code interface for creating SubQuest stories with AI assistance. It generates story content, creates visual previews, and exports ready-to-use JSON files. Detailed instructions and examples are included in the notebook.

## 📖 Story JSON Schema

If you prefer to create stories manually, they are defined using a simple JSON structure that supports branching narratives, rich content, and multiple endings.

### Basic Structure

```json
{
  "title": "Your Story Title",
  "description": "A brief description of your story",
  "startNodeId": "first_node",
  "nodes": {
    "first_node": {
      "id": "first_node",
      "title": "Chapter Title",
      "content": "The story content that will appear in the Reddit post...",
      "imageUrl": "https://example.com/image.jpg",
      "choices": [
        {
          "id": "choice_1",
          "text": "Description of choice A",
          "nextNodeId": "node_a"
        },
        {
          "id": "choice_2", 
          "text": "Description of choice B",
          "nextNodeId": "node_b"
        }
      ]
    },
    "node_a": {
      "id": "node_a",
      "title": "Ending Title",
      "content": "This is how the story ends if choice A was selected...",
      "imageUrl": "https://example.com/ending.jpg",
      "isEnd": true
    }
  }
}
```

### Schema Reference

#### Root Object
- `title` (string, required): The overall title of your story
- `description` (string, required): A brief description shown to moderators
- `startNodeId` (string, required): The ID of the first story node
- `nodes` (object, required): Collection of all story nodes

#### Story Node Object
- `id` (string, required): Unique identifier for this node
- `title` (string, required): Title that appears in the Reddit post
- `content` (string, required): The main story content
- `imageUrl` (string, optional): URL to an image that will be included in the post
- `choices` (array, optional): Available choices for this node (omit for ending nodes)
- `isEnd` (boolean, optional): Set to `true` for ending nodes

#### Choice Object
- `id` (string, required): Unique identifier for this choice
- `text` (string, required): The choice description shown to users
- `nextNodeId` (string, required): ID of the node to advance to if this choice wins

### Story Examples

The `/assets/` folder contains three example stories: a simple cave exploration (`demo_simple.json`), an epic fantasy adventure (`demo_fantasy.json`), and a business decision scenario (`demo_finance.json`).

## 🎯 How It Works

### Game Flow

1. **Story Upload**: Moderators upload a story JSON file through the settings interface
2. **Game Start**: The first story node is posted as a Reddit post with an image
3. **Choice Comments**: The app automatically creates comments for each available choice (A, B, C, etc.)
4. **Community Voting**: Community members upvote their preferred choice comments
5. **Automatic Advancement**: After the configured time period, the app counts votes and advances to the winning choice's node
6. **Story Continuation**: The process repeats until an ending node is reached
7. **Recap Generation**: When the story ends, a recap post summarizes the community's journey

### Technical Architecture

SubQuest is built using:
- **Devvit Framework**: Reddit's official app development platform
- **Redis Storage**: Persistent game state and story data
- **TypeScript**: Type-safe development with modern JavaScript features
- **Modular Design**: Clean separation of concerns with dedicated handlers for different functionality

## 🛠️ Advanced Configuration

### Round Duration Settings

Configure how long each story round lasts:
- **Minimum**: 1 hour (for testing)
- **Recommended**: 24-48 hours (for active communities)
- **Maximum**: 168 hours (1 week for slower communities)

### Image Handling

- **Supported Formats**: JPG, PNG, GIF, WebP
- **Automatic Rehosting**: External images are automatically rehosted through Devvit's media API
- **Fallback Behavior**: If image loading fails, the story continues with text-only posts
- **Size Limits**: Images are automatically optimized for Reddit's display requirements

### Error Handling

SubQuest includes robust error handling for:
- **Invalid Story JSON**: Clear validation messages for malformed stories
- **Network Issues**: Automatic retries for image fetching and Reddit API calls
- **Redis Failures**: Graceful degradation with local fallbacks
- **Scheduler Problems**: Manual advancement options for moderators

## 🎨 Creating Engaging Stories

### Best Practices

1. **Start Strong**: Hook readers with an compelling opening scenario
2. **Meaningful Choices**: Ensure each choice leads to genuinely different outcomes
3. **Visual Appeal**: Include relevant images to enhance immersion
4. **Balanced Complexity**: Aim for 10-30 nodes depending on your community's engagement level
5. **Multiple Endings**: Provide 3-5 different endings to encourage replay value
6. **Clear Consequences**: Make sure choices have logical, understandable results

### Story Themes That Work Well

- **Fantasy Adventures**: Dragons, magic, heroic quests
- **Sci-Fi Scenarios**: Space exploration, time travel, alien encounters  
- **Mystery/Detective**: Crime solving, investigation, puzzle-solving
- **Historical Fiction**: Important historical events with fictional characters
- **Modern Dilemmas**: Contemporary moral and ethical choices
- **Business/Strategy**: Entrepreneurship, management decisions, economic scenarios

### Writing Tips

- **Keep Posts Concise**: Aim for 100-300 words per story node
- **Use Active Voice**: Make the reader feel like the protagonist
- **Create Tension**: End each node with a compelling choice or cliffhanger
- **Show Don't Tell**: Use vivid descriptions rather than exposition
- **Consider Your Audience**: Match tone and complexity to your subreddit's culture

## 🔧 Development and Customization

### Project Structure

```
subquest-devvit/
├── src/
│   ├── index.ts              # Main app entry point
│   ├── handlers/             # Event handlers
│   │   ├── postManager.ts    # Reddit post creation
│   │   ├── schedulerHandler.ts # Automatic story advancement
│   │   ├── settingsHandler.ts  # Moderator interface
│   │   └── voteCounter.ts    # Vote counting logic
│   ├── utils/               # Utility classes
│   │   ├── mediaHandler.ts  # Image processing
│   │   ├── redisManager.ts  # Data persistence
│   │   └── storyEngine.ts   # Story logic
│   └── types/
│       └── index.ts         # TypeScript interfaces
├── assets/                  # Demo story files
└── README.md               # This file
```

### Local Development

1. **Set up development environment**:
   ```bash
   npm install
   npm run build
   ```

2. **Upload to test subreddit**:
   ```bash
   devvit upload --bump
   ```

### Customization Options

- **Modify Vote Counting**: Adjust tie-breaking logic in `voteCounter.ts`
- **Custom Post Formatting**: Update post templates in `postManager.ts`
- **Enhanced Media Support**: Extend image processing in `mediaHandler.ts`
- **Additional Story Validation**: Add custom validation rules in `storyEngine.ts`

## 🚀 Future Features

### Enhanced User Experience
- **Better post structuring** with improved formatting and layout
- **Native Devvit app posts** for richer, more interactive story presentation
- **Improved story generation workflow** with better AI integration and user guidance
- **Enhanced image generation** with more style options and faster processing

### Platform Integration
- **Deeper Reddit integration** leveraging more Devvit platform features
- **Enhanced moderation tools** integrated with Reddit's mod interface

## 💭 My Vision

My dream for SubQuest is to create truly organic, community-driven storytelling. Instead of pre-written stories, imagine this: start with a simple premise, then let community members comment with their ideas for what should happen next. The highest-voted suggestion gets reviewed for safety and appropriateness, then AI generates the next story node based on that community input.

This would create stories that grow naturally from the collective imagination of the community, where every twist and turn reflects what the audience actually wants to see happen. Each story would be unique, unpredictable, and genuinely collaborative - turning Reddit communities into living, breathing storytelling engines.


## 🤝 Contributing

I welcome contributions from the community! Here's how you can help:

### Ways to Contribute

1. **Create Stories**: Share your JSON story files with the community
2. **Report Bugs**: Use GitHub issues to report problems
3. **Suggest Features**: Propose new functionality or improvements
4. **Code Contributions**: Submit pull requests for bug fixes or features
5. **Documentation**: Help improve this README and other documentation

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

*Ready to turn your Reddit community into an adventure? Upload SubQuest today and start your first story!*