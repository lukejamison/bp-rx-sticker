#!/bin/bash

# Stop all Next.js dev servers

echo "🛑 Stopping all Next.js dev servers..."
pkill -f "next dev"

if [ $? -eq 0 ]; then
    echo "✓ Killed all dev servers"
else
    echo "ℹ️  No dev servers running"
fi
