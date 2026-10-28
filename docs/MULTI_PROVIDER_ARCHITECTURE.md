# Multi-Provider Model System Architecture

## Overview

DeV's multi-provider system enables resilient, adaptable AI model usage by:
- Supporting multiple free-tier cloud providers simultaneously
- Automatically falling back on rate limits or failures
- Selecting models intelligently based on task type
- Gracefully degrading when providers are exhausted
- Never breaking workflows due to single-provider dependency

## Supported Providers

### Tier 1: Primary Providers

| Provider | Speed | Cost | Free Tier | Models | Priority |
|----------|-------|------|-----------|--------|----------|
| **Groq** | ⚡⚡⚡ | Free | Yes | Mixtral, Llama-2 | 0 (Highest) |
| **OpenRouter** | ⚡⚡ | Free | Yes | 100+ models | 1 |
| **Gemini API** | ⚡⚡ | Free | Yes | Gemini 1.5 Flash/Pro | 2 |
| **NVIDIA NIM** | ⚡⚡ | Free | Yes | Production models | 3 |

### Tier 2: Fallback Providers (Future)

- Cerebras (fast, free tier)
- Together AI (cost-effective)
- OpenAI-compatible endpoints

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   ConversationEngine                         │
├─────────────────────────────────────────────────────────────┤
│                     IntentDetector                           │
│  (Greeting/Help/Clarification/Command/Task routing)        │
├─────────────────────────────────────────────────────────────┤
│                   ModelControlCenter                         │
│          (/model command, premium UI, status)               │
├─────────────────────────────────────────────────────────────┤
│                   FallbackRouter                             │
│     (Auto-route or manual override with fallback chain)     │
├─────────────────────────────────────────────────────────────┤
│                   HealthManager                              │
│    (Health checks, retry logic, rate limit handling)        │
├─────────────────────────────────────────────────────────────┤
│  ProviderFactory (Registration/Discovery/Configuration)     │
├─────────────────────────────────────────────────────────────┤
│  Tier 1 Providers: Groq, OpenRouter, Gemini, NVIDIA NIM    │
└─────────────────────────────────────────────────────────────┘
```

## Routing Decision Flow

```
User Input
    ↓
IntentDetector
    ├─ GREETING → Natural response
    ├─ HELP → Help display
    ├─ CLARIFICATION → Conversational response
    ├─ COMMAND → Command handler (/model, /memory, etc.)
    └─ TASK → ConversationEngine
        ↓
        FallbackRouter (auto or manual mode)
        ├─ Manual Override Set?
        │  └─ Use specified provider/model
        └─ Auto Mode?
           └─ Select by TaskType
               ├─ CLASSIFICATION → Fast (Groq)
               ├─ PLANNING → Strong reasoning (Gemini)
               ├─ CODING → Code specialist (OpenRouter)
               └─ INVESTIGATION → Deep analysis (Gemini)
        ↓
        HealthManager (execute with retry)
        ├─ Try primary provider
        ├─ 429 Rate Limit?
        │  └─ Fall back to next provider
        ├─ Other error?
        │  └─ Retry with backoff
        └─ Success → Return response
```

## Task-Aware Model Selection

DeV automatically selects models appropriate for task type:

### CLASSIFICATION (Fast + Cheap)
- Best: Groq Mixtral (fastest)
- Fallback: OpenRouter auto
- Cost: ~$0.0001-0.0005 per request
- Use for: Intent detection, task routing, quick analysis

### PLANNING (Strong Reasoning)
- Best: Gemini 1.5 Pro (strong reasoning)
- Fallback: OpenRouter gpt-4
- Cost: ~$0.001-0.01 per request
- Use for: Implementation plans, architecture decisions, complex breakdowns

### CODING (Code Understanding)
- Best: OpenRouter specialized coders
- Fallback: Groq (fast enough for code)
- Cost: ~$0.0005-0.002 per request
- Use for: Bug fixing, refactoring, code generation

### INVESTIGATION (Deep Analysis)
- Best: Gemini (strong reasoning)
- Fallback: OpenRouter gpt-4
- Cost: ~$0.001-0.01 per request
- Use for: Root cause analysis, debugging, failure investigation

### BROWSER_TESTING (Multimodal)
- Best: Gemini (multimodal)
- Fallback: OpenRouter Claude (vision)
- Cost: ~$0.01-0.02 per request
- Use for: Screenshot analysis, visual validation, UI testing

## Provider Health & Failover

### Health Tracking

Each provider tracks:
- **Status**: HEALTHY, DEGRADED, RATE_LIMITED, FAILED, UNKNOWN
- **Last Check**: Timestamp of last health verification
- **Consecutive Failures**: Count of sequential failures
- **Rate Limit Reset**: When rate limit window resets
- **Last Error**: Most recent error message

### Rate Limit Handling

When provider returns 429:
1. Mark provider RATE_LIMITED
2. Calculate cooldown (typically 60 seconds)
3. Store reset timestamp
4. Automatically fall back to next provider
5. Retry same request with fallback
6. Never interrupt user workflow

### Failure Recovery

After consecutive failures (>= 3):
1. Mark provider FAILED
2. Remove from active routing
3. Continue to next provider
4. Periodically health check failed providers
5. Re-enable when healthy again

### Retry Strategy

```
Request
    ↓
Try Primary Provider
    ├─ Success? → Return
    ├─ 429 Rate Limit? → Mark limited, fall back
    └─ Other Error?
        ├─ Retry 1: Wait 1s
        ├─ Retry 2: Wait 2s
        ├─ Retry 3: Wait 4s
        └─ All failed? → Fall back to next provider
```

## Configuration

### API Keys

Set in environment or `.dev/config/providers.json`:

```bash
export GROQ_API_KEY="your_key"
export OPENROUTER_API_KEY="your_key"
export GEMINI_API_KEY="your_key"
export NVIDIA_API_KEY="your_key"
```

### Provider Priority

Priority order (can be customized):

```json
{
  "providers": [
    {"id": "groq", "priority": 0},
    {"id": "openrouter", "priority": 1},
    {"id": "gemini", "priority": 2},
    {"id": "nvidia", "priority": 3}
  ]
}
```

Lower priority = higher preference (checked first)

## Auto Mode vs Manual Mode

### Auto Mode (Recommended)

```
/model auto
```

DeV automatically:
- Selects best provider for each task
- Handles provider failover transparently
- Optimizes for cost + speed
- No user intervention needed

### Manual Override

```
/model groq                    # Use Groq, default model
/model openrouter gpt-4-turbo  # Use specific model
/model gemini gemini-1.5-pro   # Use Pro version
```

Manual override:
- Uses specified provider/model consistently
- Still falls back automatically on failure
- Can return to auto with `/model auto`

## Failure Scenarios

### Scenario 1: Single Provider Rate Limited

```
Request to Groq
    ↓
Groq returns 429 (rate limited)
    ↓
Mark Groq rate limited (60s cooldown)
    ↓
Fall back to OpenRouter
    ↓
OpenRouter succeeds
    ↓
User sees response ✅
    (No indication provider switched)
```

### Scenario 2: Multiple Providers Exhausted

```
Groq (rate limited) → Skip
OpenRouter (rate limited) → Skip
Gemini (healthy) → Use
    ↓
Success ✅
```

### Scenario 3: All Providers Down

```
Groq (rate limited)
OpenRouter (rate limited)
Gemini (failed)
NVIDIA (failed)
    ↓
Error message:
"All providers currently unavailable.
Please try again in 60 seconds."
```

## Integration Points

### With ExecutionEngine

```python
from app.models.enhanced_provider_factory import get_enhanced_provider_factory
from app.models.multi_provider_system import FallbackRouter, HealthManager

factory = get_enhanced_provider_factory()
router = FallbackRouter(factory)
manager = HealthManager(factory)

# Auto-route for task
route = router.route(task_type=TaskType.CODING)

# Execute with fallback
success, result = await manager.execute_with_fallback(
    route,
    prompt="Fix the bug",
    model=route.model_name
)
```

### With ConversationEngine

```python
# Intent detection prevents bad UX
detector = IntentDetector()
result = detector.detect("hi")

if result.intent == Intent.GREETING:
    # Respond naturally, don't trigger execution
    return greeting_response()

elif result.intent == Intent.TASK:
    # Route to execution with auto model selection
    return await conversation_engine.process_task(user_input)
```

### With ModelControlCenter

```python
# Premium /model command
center = ModelControlCenter(router)

# Show status
print(center.get_status())

# Switch provider
print(center.set_provider("gemini", "gemini-1.5-pro"))

# Auto mode
print(center.set_provider("auto"))
```

## Performance Characteristics

### Latency

| Operation | Latency |
|-----------|---------|
| Intent detection | < 5ms |
| Provider selection | < 1ms |
| Health check | 100-500ms |
| Request to Groq | 500ms-2s |
| Request with fallback | 500ms-4s |
| First response to user | < 3s |

### Cost Per Task

- **Classification**: ~$0.0003
- **Planning**: ~$0.005
- **Coding**: ~$0.001
- **Investigation**: ~$0.008
- **Browser Testing**: ~$0.012

Free tier monthly:
- Groq: ~2M tokens
- OpenRouter: $5 free credit
- Gemini: 50 RPM free
- NVIDIA: Free tier available

## Future Enhancements

### Planned

1. **Smart cost routing** - Choose cheapest provider for non-critical tasks
2. **Provider analytics** - Track which providers perform best for each task
3. **Custom provider registration** - Allow users to add custom endpoints
4. **Rate limit prediction** - Proactively avoid providers approaching limits
5. **Caching layer** - Cache common responses to reduce API calls

### Tier 2 Providers

- Cerebras (very fast inference)
- Together AI (cost-effective)
- Replicate (experimental models)
- Local LLM fallback (Ollama)

## Troubleshooting

### Provider Not Found

```
❌ Provider not found: xyz
Available: groq, openrouter, gemini, nvidia
```

**Fix**: Check `/model` to see available providers

### Rate Limited Repeatedly

```
⏳ Groq rate limited
Falling back to OpenRouter...
```

**Fix**: Provider might be exhausted. Wait for reset or use `/model` to switch.

### All Providers Unavailable

**Fix**:
1. Check API keys in environment
2. Verify internet connection
3. Check provider status pages
4. Wait for rate limit reset (60s)

## Configuration Examples

### Setup All Providers

```bash
# Get API keys from:
# - Groq: https://console.groq.com
# - OpenRouter: https://openrouter.ai
# - Gemini: https://ai.google.dev
# - NVIDIA: https://build.nvidia.com

export GROQ_API_KEY="gsk_..."
export OPENROUTER_API_KEY="sk-..."
export GEMINI_API_KEY="AIza..."
export NVIDIA_API_KEY="nvapi_..."

dev
```

### Use Only Free Providers

All Tier 1 providers support free tier. Just set API keys and DeV automatically:
- Routes intelligently
- Stays within free tier limits
- Falls back on quota exhaustion
- Never requires paid upgrade

### Local Development

For development, set mock providers:

```python
from app.models.multi_provider_system import ProviderFactory, BaseProvider

factory = ProviderFactory()
# Register mock provider for testing
```

