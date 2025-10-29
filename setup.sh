#!/bin/bash

# SubQuest Setup Script
# This script helps you quickly set up and deploy SubQuest to your Reddit community

echo "🎲 SubQuest Setup Script"
echo "========================"

# Check if devvit is installed
if ! command -v devvit &> /dev/null; then
    echo "❌ Devvit CLI not found. Installing..."
    npm install -g devvit
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install Devvit CLI. Please install manually:"
        echo "   npm install -g devvit"
        exit 1
    fi
    echo "✅ Devvit CLI installed successfully"
fi

# Check if user is logged in
echo "🔐 Checking Devvit authentication..."
if ! devvit whoami &> /dev/null; then
    echo "❌ Not logged in to Devvit. Please login:"
    devvit login
    if [ $? -ne 0 ]; then
        echo "❌ Login failed. Please try again."
        exit 1
    fi
fi

echo "✅ Authenticated with Devvit"

# Install dependencies
echo "📦 Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed"

# Check TypeScript compilation
echo "🔨 Checking TypeScript compilation..."
npm run build

# Upload to Reddit
echo "🚀 Uploading SubQuest to Reddit..."
devvit upload
if [ $? -ne 0 ]; then
    echo "❌ Upload failed. Please check your code and try again."
    exit 1
fi

echo "✅ SubQuest uploaded successfully!"

# Prompt for subreddit installation
echo ""
echo "📋 Next Steps:"
echo "1. Install SubQuest to your subreddit:"
echo "   devvit install your-subreddit-name"
echo ""
echo "2. Configure your first story:"
echo "   - Go to reddit.com/r/your-subreddit"
echo "   - Navigate to Mod Tools → Apps → SubQuest → Settings"
echo "   - Enable 'Test Mode' for quick testing (2-minute rounds)"
echo "   - Copy story content from assets/demo_fantasy.json"
echo "   - Paste into 'Story JSON Content'"
echo "   - Check 'Start New Game' and save"
echo ""
echo "3. Create your first story post:"
echo "   - Use 'Create SubQuest Story Post' from subreddit menu"
echo "   - Vote on choice comments to test the system"
echo "   - Use 'Advance SubQuest Round' to skip waiting"
echo ""
echo "🎉 SubQuest is ready! Check TESTING.md for detailed testing instructions."

# Ask if user wants to install to a subreddit now
echo ""
read -p "Would you like to install to a subreddit now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Enter your subreddit name (without r/): " subreddit
    if [ ! -z "$subreddit" ]; then
        echo "Installing to r/$subreddit..."
        devvit install "$subreddit"
        if [ $? -eq 0 ]; then
            echo "✅ Installed to r/$subreddit successfully!"
            echo "🔗 Configure at: https://reddit.com/r/$subreddit/about/apps"
        else
            echo "❌ Installation failed. You can install manually later with:"
            echo "   devvit install $subreddit"
        fi
    fi
fi

echo ""
echo "🎲 SubQuest setup complete! Happy storytelling!"