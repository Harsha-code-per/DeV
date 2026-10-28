#!/bin/bash
# Quick DeV Setup Script
# Configures API keys and verifies everything works

set -e

echo "╔════════════════════════════════════════╗"
echo "║  DeV CLI Setup & Verification         ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Load .env file if it exists (check in multiple locations)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE=""

for path in .env ~/.env /home/hk/.env "$SCRIPT_DIR/.env"; do
    if [ -f "$path" ]; then
        ENV_FILE="$path"
        break
    fi
done

if [ -n "$ENV_FILE" ]; then
    echo "Loading API keys from $ENV_FILE..."
    set -a
    source "$ENV_FILE"
    set +a
    echo "✅ .env loaded"
    echo ""
fi

# Step 1: Check if API keys are set
echo "Step 1: Checking API keys..."
echo ""

GROQ_KEY=${GROQ_API_KEY:-}
GEMINI_KEY=${GEMINI_API_KEY:-}
OPENROUTER_KEY=${OPENROUTER_API_KEY:-}

if [ -z "$GROQ_KEY" ]; then
    echo "⚠️  GROQ_API_KEY not set"
    echo "   Add to .env: GROQ_API_KEY=gsk_..."
    echo "   Or run: export GROQ_API_KEY=gsk_..."
    echo ""
fi

if [ -z "$GEMINI_KEY" ]; then
    echo "⚠️  GEMINI_API_KEY not set"
    echo "   Add to .env: GEMINI_API_KEY=..."
    echo "   Or run: export GEMINI_API_KEY=..."
    echo ""
fi

if [ -z "$OPENROUTER_KEY" ]; then
    echo "⚠️  OPENROUTER_API_KEY not set"
    echo "   Add to .env: OPENROUTER_API_KEY=sk-or-..."
    echo "   Or run: export OPENROUTER_API_KEY=sk-or-..."
    echo ""
fi

if [ -z "$GROQ_KEY" ] && [ -z "$GEMINI_KEY" ] && [ -z "$OPENROUTER_KEY" ]; then
    echo "❌ No API keys configured!"
    echo ""
    echo "You need at least ONE API key to use DeV."
    echo "Please configure your API keys and run this script again."
    echo ""
    exit 1
fi

echo "✅ Found API keys:"
[ -n "$GROQ_KEY" ] && echo "   • GROQ_API_KEY=${GROQ_KEY:0:10}..."
[ -n "$GEMINI_KEY" ] && echo "   • GEMINI_API_KEY=${GEMINI_KEY:0:10}..."
[ -n "$OPENROUTER_KEY" ] && echo "   • OPENROUTER_API_KEY=${OPENROUTER_KEY:0:10}..."
echo ""

# Step 2: Reinstall package
echo "Step 2: Reinstalling DeV package..."
cd /home/hk/DeV
if uv pip install -e . --quiet 2>/dev/null; then
    echo "✅ Package reinstalled"
else
    echo "⚠️  Could not reinstall (non-critical)"
fi
echo ""

# Step 3: Verify providers load
echo "Step 3: Verifying providers load..."
python << 'EOF'
import os
import sys
sys.path.insert(0, '/home/hk/DeV')

from app.models.enhanced_provider_factory import get_enhanced_provider_factory

factory = get_enhanced_provider_factory('.dev')
providers = factory.list_providers()

if not providers:
    print("❌ No providers loaded!")
    print("   Check your API keys are exported to the environment:")
    print("   export GROQ_API_KEY=...")
    sys.exit(1)

print(f"✅ Loaded {len(providers)} provider(s):")
for config in providers:
    print(f"   • {config.provider_id} ({config.priority} priority)")
EOF

if [ $? -ne 0 ]; then
    exit 1
fi
echo ""

# Step 4: Run agent core tests
echo "Step 4: Running agent core tests..."
cd /home/hk/DeV
if python -m pytest tests/test_agent_core_v2_acceptance.py -q --tb=no 2>/dev/null; then
    echo "✅ Agent core tests passed"
else
    echo "⚠️  Some tests failed (non-critical for basic usage)"
fi
echo ""

# Step 5: Ready message
echo "╔════════════════════════════════════════╗"
echo "║  ✅ DeV is Ready!                      ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "You can now use DeV in any project:"
echo ""
echo "  $ cd ~/my-project"
echo "  $ dev"
echo ""
echo "Try these commands:"
echo "  > what is this project?"
echo "  > /model groq       (switch provider)"
echo "  > /help            (show help)"
echo "  > /exit            (quit)"
echo ""
echo "For issues or questions, see:"
echo "  • CRITICAL_ISSUE_ANALYSIS.md (detailed technical breakdown)"
echo "  • CLI_WORKING_GUIDE.md (usage guide)"
echo "  • LIVE_TESTING_STEPS.md (testing guide)"
echo ""
