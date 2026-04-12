#!/bin/bash
# Move to the script's directory
cd "$(dirname "$0")"

echo "------------------------------------------------"
echo "🚀 CELESTIAL EXPLORER: STARTING SIMULATION..."
echo "------------------------------------------------"
echo "Modern browsers block 3D assets when opened raw."
echo "I am starting a local server to enable 3D flight."
echo "------------------------------------------------"

# Attempt to open browser after a short delay
(sleep 2 && open http://localhost:3000) &

# Try npx first, fallback to Python
if command -v npx > /dev/null 2>&1; then
    echo "Using NPX SERVE on port 3000..."
    npx serve -l 3000 .
else
    echo "NPX not found, using Python fallback..."
    python3 -m http.server 3000
fi
