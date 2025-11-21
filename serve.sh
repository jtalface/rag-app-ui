#!/bin/bash

# Serve the frontend locally
# Usage: ./serve.sh [port]

PORT=${1:-8080}

echo "🌐 Starting frontend server..."
echo "📍 http://localhost:${PORT}"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Check if Python 3 is available
if command -v python3 &> /dev/null; then
    python3 -m http.server ${PORT}
elif command -v python &> /dev/null; then
    python -m http.server ${PORT}
else
    echo "❌ Python not found. Please install Python to serve the frontend."
    exit 1
fi

