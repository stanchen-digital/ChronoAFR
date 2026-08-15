#!/bin/bash
# ChronoAFR One-Click Launcher

PROJECT_DIR="/Users/stanchen/Projects/personal/investment_analyzer"

echo "=================================================="
echo "⏳ Starting ChronoAFR (Analysis, Forecast & Review)..."
echo "=================================================="

cd "$PROJECT_DIR" || exit 1

# Open browser automatically after 1.5s
(sleep 1.5 && open "http://localhost:8000") &

# Run FastAPI Server with Python 3.12
./venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
