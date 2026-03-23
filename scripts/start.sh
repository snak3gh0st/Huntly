#!/bin/bash
# Start Huntly with all dependencies (Ollama + Docker services)

set -e

echo "🔍 Checking Ollama..."
if ! command -v ollama &>/dev/null; then
  echo "❌ Ollama not installed. Install with: brew install ollama"
  exit 1
fi

# Start Ollama if not already running
if ! curl -s http://localhost:11434/api/tags &>/dev/null; then
  echo "🚀 Starting Ollama..."
  ollama serve &>/dev/null &
  OLLAMA_PID=$!

  # Wait for it to be ready
  for i in {1..15}; do
    if curl -s http://localhost:11434/api/tags &>/dev/null; then
      echo "✅ Ollama is running (PID $OLLAMA_PID)"
      break
    fi
    sleep 1
  done

  if ! curl -s http://localhost:11434/api/tags &>/dev/null; then
    echo "❌ Ollama failed to start"
    exit 1
  fi
else
  echo "✅ Ollama already running"
fi

# Check if the default model is pulled
MODEL="${OLLAMA_MODEL:-qwen3.5:latest}"
if ! ollama list 2>/dev/null | grep -q "$MODEL"; then
  echo "📦 Pulling $MODEL..."
  ollama pull "$MODEL"
fi

echo ""
echo "🐳 Starting Docker services..."
docker compose up --build -d

echo ""
echo "✅ Huntly is running!"
echo "   Backend:   http://localhost:3002"
echo "   Dashboard:  cd dashboard && npm run dev"
echo "   Ollama:    http://localhost:11434 ($MODEL)"
