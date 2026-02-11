#!/bin/bash

# Clean start script for BP RX Sticker app
# Kills any running dev servers and clears cache

echo "🧹 Cleaning up..."

# Kill any running Next.js dev processes
pkill -f "next dev" 2>/dev/null && echo "✓ Killed existing dev servers"

# Remove .next cache
cd "$(dirname "$0")"
rm -rf .next
echo "✓ Cleared .next cache"

# Wait a moment
sleep 1

# Start dev server
echo "🚀 Starting dev server..."
npm run dev
